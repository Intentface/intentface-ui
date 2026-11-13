// Fails when the docs and the package disagree, in either direction: a page
// documents something the package does not output, or the package outputs a
// prop, data-* attribute or CSS variable that no page lists.
//
// Docs drift silently, because a renamed part or a new attribute breaks nothing
// at build time. The coding-agent skill sends agents to the docs for the full
// list of props, attributes and variables, so the docs have to be that list.
// Props and state come from the TypeScript compiler, and attributes and
// variables from each namespace's syntax tree, because regex cannot see
// multi-line types, inherited props or comments.
//
//   node scripts/audit-docs.mjs [--docs <dir>]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(path.resolve("package.json"));
const ts = require("typescript");
const { default: GithubSlugger } = await import(
  pathToFileURL(
    createRequire(
      path.resolve(path.dirname(require.resolve("fumadocs-core/package.json")), "package.json"),
    ).resolve("github-slugger"),
  )
);

const NAMESPACES = {
  composer: "Composer",
  message: "Message",
  thread: "Thread",
  steps: "Steps",
  reasoning: "Reasoning",
  chip: "Chip",
  attachments: "Attachments",
  "ask-user": "AskUser",
  shell: "Shell",
  nav: "Nav",
  tabs: "Tabs",
};
const KNOWN_GAPS = [
  [
    /^(?:undocumented(?: prop| attribute| CSS variable)?: AskUser\b|no docs page: @intentface\/ui\/ask-user$)/,
    "PR #75 renames AskUser to Ask and data-ask-user-* to data-ask-*; the page is written after it lands.",
  ],
  [/^no docs page: @intentface\/ui\/message-utils$/, "UI-78 removes this entry point."],
];
const SRC = "packages/ui/src";
const DOCS = process.argv.includes("--docs")
  ? process.argv[process.argv.indexOf("--docs") + 1]
  : "content/docs";
const SKILLS = "skills";
const SITE_PAGE = /https:\/\/ui\.intentface\.com\/([\w/-]+)\.md/g;
const PROPS_EVERY_PAGE_INTRO_COVERS = new Set(["className", "style", "render", "ref", "key"]);
const DATA_ATTRIBUTE = /^data-[a-z][a-z-]*$/;
const ATTRIBUTE_SELECTOR = /\[(data-[a-z][a-z-]*)(?=[\]=~|^$*])/g;
const CSS_VARIABLE = /(?<![\w-])--[a-zA-Z][\w-]*/g;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const union = (sets) => new Set(sets.flatMap((set) => [...set]));

const packageExports = JSON.parse(readFileSync("packages/ui/package.json", "utf8")).exports;

const entryPoints = Object.entries(packageExports).map(([key, target]) => ({
  slug: key.slice(2),
  name: `@intentface/ui${key.slice(1)}`,
  module: path.resolve(SRC, target.types.replace(/^\.\/dist\//, "").replace(/\.d\.ts$/, ".ts")),
}));
const entryPointNames = new Set(entryPoints.map((entry) => entry.name));

const namespaceRoot = (slug) => path.resolve(SRC, slug, "index.parts.ts");
const moduleRoots = entryPoints.filter(({ slug }) => !NAMESPACES[slug]).map(({ module }) => module);
const roots = [...Object.keys(NAMESPACES).map(namespaceRoot), ...moduleRoots];
const config = ts.readConfigFile("packages/ui/tsconfig.json", ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, "packages/ui");
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const srcPrefix = `${path.resolve(SRC)}${path.sep}`;

const isDeclaredHere = (symbol) =>
  symbol.declarations?.some((declaration) =>
    declaration.getSourceFile().fileName.startsWith(srcPrefix),
  ) ?? false;

const exportsOf = (root) =>
  checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(root)));

const resolveParts = (root) => {
  const parts = {};
  for (const symbol of exportsOf(root)) {
    const declaration = symbol.declarations?.[0];
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const type = checker.getTypeOfSymbolAtLocation(target, target.declarations?.[0] ?? declaration);
    const signature = type.getCallSignatures()[0];
    const parameter = signature?.getParameters()[0];
    if (!parameter) {
      parts[symbol.getName()] = { props: [], ownProps: [], state: [] };
      continue;
    }
    const propsType = checker.getTypeOfSymbolAtLocation(
      parameter,
      parameter.declarations?.[0] ?? declaration,
    );
    // State is the parameter of the className callback overload.
    let state = [];
    const className = propsType.getProperty("className");
    if (className) {
      const classNameType = checker.getTypeOfSymbolAtLocation(
        className,
        className.declarations?.[0] ?? declaration,
      );
      for (const candidate of classNameType.isUnion() ? classNameType.types : [classNameType]) {
        const stateParam = candidate.getCallSignatures()[0]?.getParameters()[0];
        if (!stateParam) continue;
        state = checker
          .getTypeOfSymbolAtLocation(stateParam, stateParam.declarations?.[0] ?? declaration)
          .getProperties()
          .map((p) => p.getName());
      }
    }
    const properties = propsType.getProperties();
    parts[symbol.getName()] = {
      props: properties.map((p) => p.getName()),
      ownProps: properties
        .filter((p) => isDeclaredHere(p) && !PROPS_EVERY_PAGE_INTRO_COVERS.has(p.getName()))
        .map((p) => p.getName()),
      state,
    };
  }
  return parts;
};

const unwrap = (node) =>
  ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrap(node.expression)
    : node;

const isStateMappingType = (type) =>
  type !== undefined &&
  ts.isTypeReferenceNode(type) &&
  type.typeName.getText() === "StateAttributesMapping";

const keysOf = (literal) =>
  literal.properties.flatMap((property) => {
    const name = property.name;
    if (!name || !(ts.isIdentifier(name) || ts.isStringLiteralLike(name))) return [];
    return [name.text];
  });

const mappingLiteralOf = (node) => {
  let value;
  if (ts.isPropertyAssignment(node) && node.name.getText() === "stateAttributesMapping")
    value = node.initializer;
  else if (ts.isVariableDeclaration(node) && isStateMappingType(node.type))
    value = node.initializer;
  else if (ts.isSatisfiesExpression(node) && isStateMappingType(node.type)) value = node.expression;
  const literal = value && unwrap(value);
  return literal && ts.isObjectLiteralExpression(literal) ? literal : undefined;
};

const scanned = new Map();

const resolveImport = (from, specifier) => {
  const base = path.resolve(path.dirname(from), specifier).replace(/\.(js|ts|tsx)$/, "");
  return [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ].find(existsSync);
};

const scanFile = (file) => {
  if (scanned.has(file)) return scanned.get(file);
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const scan = {
    attributes: new Set(),
    readFromConsumerMarkup: new Set(),
    variables: new Set(),
    mappedKeys: new Set(),
    imports: [],
  };

  const addVariables = (node, { dynamicTail }) => {
    for (const match of node.text.matchAll(CSS_VARIABLE)) {
      const name = match[0];
      const reachesEnd = match.index + name.length === node.text.length;
      if (name.endsWith("-") || (dynamicTail && reachesEnd)) continue;
      scan.variables.add(name);
    }
  };

  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      if (DATA_ATTRIBUTE.test(node.text)) scan.attributes.add(node.text);
      for (const [, name] of node.text.matchAll(ATTRIBUTE_SELECTOR))
        scan.readFromConsumerMarkup.add(name);
      addVariables(node, { dynamicTail: false });
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      addVariables(node, { dynamicTail: true });
    } else if (ts.isTemplateTail(node)) {
      addVariables(node, { dynamicTail: false });
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (DATA_ATTRIBUTE.test(name)) scan.attributes.add(name);
    } else if (
      (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith(".")) scan.imports.push(resolveImport(file, specifier));
    }
    for (const key of keysOf(mappingLiteralOf(node) ?? { properties: [] }))
      scan.mappedKeys.add(key);
    ts.forEachChild(node, visit);
  };
  visit(source);

  scanned.set(file, scan);
  return scan;
};

const ownFilesAndDirectInternalImports = (slug) => {
  const own = walk(path.resolve(SRC, slug));
  const internalPrefix = path.resolve(SRC, "internal") + path.sep;
  const internal = own.flatMap((file) =>
    scanFile(file).imports.filter((imported) => imported?.startsWith(internalPrefix)),
  );
  return [...new Set([...own, ...internal])];
};

const derivedAttributes = ({ state }, mappedKeys) => {
  const attributes = new Set();
  for (const key of state) {
    if (key === "open") attributes.add("data-open").add("data-closed");
    else if (key === "transitionStatus")
      attributes.add("data-starting-style").add("data-ending-style");
    else if (!mappedKeys.has(key)) attributes.add(`data-${key.toLowerCase()}`);
  }
  return attributes;
};

const surface = Object.fromEntries(
  Object.entries(NAMESPACES).map(([slug, namespace]) => {
    const parts = resolveParts(namespaceRoot(slug));
    const scans = ownFilesAndDirectInternalImports(slug).map(scanFile);
    const mappedKeys = union(scans.map((scan) => scan.mappedKeys));
    const literals = union(scans.map((scan) => scan.attributes));
    const derived = Object.values(parts).map((part) => derivedAttributes(part, mappedKeys));
    return [
      namespace,
      {
        parts,
        attributes: union([literals, ...derived]),
        variables: union(scans.map((scan) => scan.variables)),
        literals,
        mappedKeys,
      },
    ];
  }),
);

const sourceScans = walk(SRC).map(scanFile);
const anyAttribute = union([
  ...Object.values(surface).map(({ attributes }) => attributes),
  ...sourceScans.flatMap(({ attributes, readFromConsumerMarkup }) => [
    attributes,
    readFromConsumerMarkup,
  ]),
]);
const anyVariable = union(sourceScans.map(({ variables }) => variables));

const emittedBy = (namespace, part) =>
  new Set([
    ...surface[namespace].literals,
    ...derivedAttributes(surface[namespace].parts[part], surface[namespace].mappedKeys),
  ]);

const FENCE = /^[ \t]*```[\s\S]*?^[ \t]*```/gm;
const stripFences = (text) => text.replace(FENCE, "");

const cellTokens = (cell) => cell.split(/[\s/,]+/).filter(Boolean);

const rowsOf = (text, column) =>
  [...text.matchAll(new RegExp(`\\{\\s*${column}:\\s*["']([^"']+)["']`, "g"))].flatMap(([, cell]) =>
    cellTokens(cell),
  );

const documentedBy = (text, namespace) => {
  const body = stripFences(text);
  const parts = surface[namespace].parts;
  const sections = {};
  const unknownParts = [];

  for (const block of body.split(/^### /m).slice(1)) {
    // A part's section ends at the next `##` too, so a hook documented under its
    // own `##` heading isn't read as the preceding part's props.
    const section = block.split(/^## /m)[0];
    const heading = section.split("\n", 1)[0].trim().replace(/\(\)$/, "");
    let part;
    if (heading.startsWith(`${namespace}.`)) part = heading.slice(namespace.length + 1);
    else if (heading === namespace) part = "Root";
    else if (parts[heading]) part = heading;
    else continue; // a prose heading, not a part reference

    if (!parts[part]) {
      unknownParts.push(part);
      continue;
    }
    sections[part] ??= { props: new Set(), attributes: new Set() };
    for (const name of rowsOf(section, "name")) sections[part].props.add(name);
    for (const name of rowsOf(section, "attribute")) sections[part].attributes.add(name);
  }

  return {
    sections,
    props: new Set(rowsOf(body, "name")),
    attributes: new Set(rowsOf(body, "attribute")),
    unknownParts,
  };
};

const auditPage = (slug, namespace) => {
  const file = path.join(DOCS, "primitives", `${slug}.mdx`);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { parts, attributes, variables } = surface[namespace];
  const documented = documentedBy(text, namespace);
  const findings = [];

  for (const part of documented.unknownParts)
    findings.push(`part does not exist: ${namespace}.${part}`);

  for (const [part, section] of Object.entries(documented.sections)) {
    const emitted = emittedBy(namespace, part);
    for (const name of section.props) {
      if (!parts[part].props.includes(name))
        findings.push(`no such prop: ${namespace}.${part}.${name}`);
    }
    for (const attribute of section.attributes) {
      if (attribute.startsWith("data-") && !emitted.has(attribute))
        findings.push(`never emitted: ${namespace}.${part} → ${attribute}`);
    }
  }
  const inSections = union(Object.values(documented.sections).map((section) => section.attributes));
  for (const attribute of documented.attributes) {
    if (attribute.startsWith("--") && !variables.has(attribute))
      findings.push(`never published: ${namespace} → ${attribute}`);
    else if (
      attribute.startsWith("data-") &&
      !inSections.has(attribute) &&
      !attributes.has(attribute)
    )
      findings.push(`never emitted: ${namespace} → ${attribute}`);
  }

  // A part counts as covered by a prose mention; trivial sub-parts are grouped
  // rather than given a heading each.
  const uncovered = Object.keys(parts).filter(
    (part) => !text.includes(`${namespace}.${part}`) && part !== "Root",
  );
  for (const part of uncovered) findings.push(`undocumented: ${namespace}.${part}`);

  for (const [part, { ownProps }] of Object.entries(parts)) {
    if (uncovered.includes(part)) continue;
    const documentedProps = documented.sections[part]?.props ?? documented.props;
    for (const name of ownProps) {
      if (!documentedProps.has(name))
        findings.push(`undocumented prop: ${namespace}.${part}.${name}`);
    }
  }
  for (const attribute of attributes) {
    if (!documented.attributes.has(attribute))
      findings.push(`undocumented attribute: ${namespace} → ${attribute}`);
  }
  for (const variable of variables) {
    if (!documented.attributes.has(variable))
      findings.push(`undocumented CSS variable: ${namespace} → ${variable}`);
  }

  return findings;
};

// Shell blocks hold CLI flags, which read like CSS variables.
const SHELL_BLOCK = /^```(?:sh|bash|shell|console)\n[\s\S]*?^```/gm;
const CODE_BLOCK = /^```\w*\n([\s\S]*?)^```/gm;
const INLINE_CODE = /`([^`\n]+)`/g;
const PART = new RegExp(`\\b(${Object.values(NAMESPACES).join("|")})\\.([A-Za-z]\\w*)`, "g");

// Every JSX attribute in a snippet, as [tag, attribute].
const jsxAttributes = (code) => {
  const source = ts.createSourceFile(
    "snippet.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute)) found.push([tag, attribute.name.getText(source)]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

// Fenced code blocks, plus inline code that opens a JSX tag: `<Composer.Submit isGenerating>`.
const snippetsOf = (text) => [
  ...[...text.replace(SHELL_BLOCK, "").matchAll(CODE_BLOCK)].map(([, code]) => code),
  ...[...text.replace(CODE_BLOCK, "").matchAll(/`(<[A-Z][^`]*)`/g)].map(([, code]) => code),
];

const codeOf = (text) =>
  [...text.matchAll(CODE_BLOCK), ...text.replace(CODE_BLOCK, "").matchAll(INLINE_CODE)]
    .map(([, code]) => code)
    .join("\n");

const auditSkillFile = (file) => {
  const text = readFileSync(file, "utf8");
  const findings = [];

  for (const [entry] of text.matchAll(/@intentface\/ui\/[\w-]+/g)) {
    if (!entryPointNames.has(entry)) findings.push(`no such entry point: ${entry}`);
  }
  for (const [name, namespace, part] of text.matchAll(PART)) {
    if (!surface[namespace].parts[part]) findings.push(`part does not exist: ${name}`);
  }
  // Props are checked where a part receives them in JSX, because prose can't
  // say which part a bare prop name belongs to.
  for (const [tag, name] of snippetsOf(text).flatMap(jsxAttributes)) {
    const [namespace, part] = tag.split(".");
    const props = surface[namespace]?.parts[part]?.props;
    if (!props || name === "key" || name.startsWith("data-")) continue;
    if (!props.includes(name)) findings.push(`no such prop: ${tag}.${name}`);
  }
  // The plain name and Tailwind's arbitrary form: data-highlighted:, data-[role=user]:
  const appAttributes = new Set(
    snippetsOf(text)
      .flatMap(jsxAttributes)
      .map(([, name]) => name),
  );
  for (const [, arbitrary, plain] of codeOf(text).matchAll(
    /\bdata-(?:\[([a-z-]+)|([a-z][a-z-]*[a-z]))/g,
  )) {
    const attribute = `data-${arbitrary ?? plain}`;
    if (!anyAttribute.has(attribute) && !appAttributes.has(attribute))
      findings.push(`never emitted: ${attribute}`);
  }
  // A name followed by "(" is a function, such as Tailwind's --spacing().
  const code = text.replace(SHELL_BLOCK, "");
  const appVariables = new Set(
    [...code.matchAll(/(?:\[|^\s*|;\s*)(--[a-z][a-z0-9-]*[a-z0-9])\s*:/gm)].map(([, v]) => v),
  );
  for (const [, variable] of code.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*[a-z0-9])(?![\w(-])/g)) {
    if (!anyVariable.has(variable) && !appVariables.has(variable))
      findings.push(`never published: ${variable}`);
  }
  for (const [url, slug] of text.matchAll(SITE_PAGE)) {
    if (!existsSync(path.join(DOCS, `${slug}.mdx`))) findings.push(`no such docs page: ${url}`);
  }

  return [...new Set(findings)];
};

const docFiles = readdirSync(DOCS, { recursive: true })
  .filter((file) => file.endsWith(".mdx") && !file.split(path.sep).includes("demos"))
  .map((file) => path.join(DOCS, file));

const routeOf = (file) =>
  path
    .relative(DOCS, file)
    .replace(/\.mdx$/, "")
    .replace(/(^|\/)index$/, "");

const flatten = (heading) =>
  heading
    .replace(/\s*\[#[^\]]+\]\s*$/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1$2")
    .trim();

// Slugged the way fumadocs does it (remark-heading: github-slugger, with a
// trailing `[#custom-id]` taking precedence).
const headingIds = (text) => {
  const slugger = new GithubSlugger();
  return new Set(
    [...stripFences(text).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)].map(([, heading]) => {
      const custom = heading.match(/\[#([^\]]+)\]\s*$/);
      return custom ? custom[1] : slugger.slug(flatten(heading));
    }),
  );
};

const isRouteGroup = (segment) => /^\(.*\)$/.test(segment);

const appRoutes = new Set(
  readdirSync("app", { recursive: true })
    .filter((file) => /(^|\/)(page|route)\.(tsx?|mjs)$/.test(file))
    .map((file) =>
      path
        .dirname(file)
        .split(path.sep)
        .filter((segment) => !isRouteGroup(segment))
        .join("/"),
    )
    .map((route) => (route === "." ? "" : route)),
);

const pages = new Map(
  docFiles.map((file) => [routeOf(file), { file, ids: headingIds(readFileSync(file, "utf8")) }]),
);

const auditLinks = (file) => {
  const own = routeOf(file);
  const findings = [];
  for (const [, target] of stripFences(readFileSync(file, "utf8")).matchAll(
    /\]\(((?:\/|#|\.{1,2}\/)[^)\s]*)\)/g,
  )) {
    const url = new URL(target, `https://docs.invalid/${own}`);
    const route = decodeURIComponent(url.pathname)
      .replace(/^\//, "")
      .replace(/\.mdx?$/, "");
    const anchor = decodeURIComponent(url.hash.slice(1));
    const page = pages.get(route);
    if (!page) {
      if (!appRoutes.has(route)) findings.push(`dead link: ${target}`);
    } else if (anchor && !page.ids.has(anchor)) {
      findings.push(`dead link: ${target} (no such heading)`);
    }
  }
  return [...new Set(findings)];
};

const sourceOf = (text) => text.match(/^---\n[\s\S]*?^source:\s*(\S+)\s*$/m)?.[1];

const auditEntryPoints = () => {
  const findings = [];
  const sources = docFiles.map((file) => [
    readFileSync(file, "utf8"),
    sourceOf(readFileSync(file, "utf8")),
  ]);
  for (const { slug, name, module } of entryPoints) {
    const accepted = [slug, `${slug}.ts`, `${slug}.tsx`];
    const page = sources.find(([, source]) => accepted.includes(source));
    if (!page) {
      findings.push(`no docs page: ${name}`);
      continue;
    }
    if (NAMESPACES[slug]) continue;
    for (const symbol of exportsOf(module)) {
      const exported = symbol.getName();
      const mentioned = new RegExp(`(?<![\\w$])${escapeRegExp(exported)}(?![\\w$])`);
      if (!mentioned.test(page[0])) findings.push(`undocumented export: ${name} → ${exported}`);
    }
  }
  return findings;
};

const skillFiles = readdirSync(SKILLS, { recursive: true })
  .filter((file) => file.endsWith(".md"))
  .map((file) => path.join(SKILLS, file));

const audits = [
  ...Object.entries(NAMESPACES).map(([slug, namespace]) => [
    `${slug}.mdx`,
    auditPage(slug, namespace),
  ]),
  ...docFiles.map((file) => [file, [...auditSkillFile(file), ...auditLinks(file)]]),
  ...skillFiles.map((file) => [file, auditSkillFile(file)]),
  ["packages/ui/package.json", auditEntryPoints()],
];

const knownGapFor = (finding) => KNOWN_GAPS.find(([pattern]) => pattern.test(finding));

const failing = [];
const known = [];
for (const [label, findings] of audits) {
  for (const finding of new Set(findings)) {
    (knownGapFor(finding) ? known : failing).push([label, finding]);
  }
}
const stale = KNOWN_GAPS.filter(
  ([pattern]) => ![...known].some(([, finding]) => pattern.test(finding)),
);

const printGrouped = (entries, mark) => {
  const byLabel = Map.groupBy(entries, ([label]) => label);
  for (const [label, group] of byLabel) {
    console.error(`\n${label}`);
    for (const [, finding] of group) console.error(`  ${mark} ${finding}`);
  }
};

if (known.length) {
  console.error("\nKnown gaps (do not fail the run)");
  for (const [pattern, reason] of KNOWN_GAPS) {
    const matched = known.filter(([, finding]) => pattern.test(finding));
    if (!matched.length) continue;
    console.error(`\n  ${reason}`);
    for (const [label, finding] of matched) console.error(`    - ${label}: ${finding}`);
  }
}

printGrouped(failing, "✗");
for (const [pattern] of stale) console.error(`\n✗ stale known gap, matches no finding: ${pattern}`);

if (failing.length || stale.length) {
  console.error(
    `\n${failing.length} contradiction(s) between the docs and the package` +
      `${stale.length ? `, ${stale.length} stale known gap(s)` : ""}.\n`,
  );
  process.exit(1);
}
console.log(
  "Docs match the package: every documented part, prop, attribute and CSS variable resolves, and everything the package outputs is documented.",
);

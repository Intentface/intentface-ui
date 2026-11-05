// Fails when the primitive reference pages or the coding-agent skill contradict
// the package.
//
// Docs drift silently: a renamed part or a dropped prop breaks nothing at build
// time, so pages keep documenting an API that no longer exists. This resolves
// each part's real props and state through the TypeScript compiler — not regex,
// which cannot see multi-line types or inherited props — and diffs the pages
// against it.
//
//   node scripts/audit-docs.mjs
//
// Checks per documented part: the part exists, every PropsTable `name` is a real
// prop, and every AttributesTable `attribute` is one the part can emit.
//
// Checks per skill file: every entry point, part, attribute, CSS variable and
// docs page it names exists, and every prop it passes to a part in JSX is real.
// CSS variables the skill defines itself are the app's and pass.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve("package.json"));
const ts = require("typescript");

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
// Namespaces with no reference page yet. The skill is still checked against them.
const UNPAGED = new Set(["ask-user"]);
const SRC = "packages/ui/src";
const DOCS = "content/docs";
const SKILLS = "skills";
const SITE = "https://ui.intentface.com";

// ---------------------------------------------------------------------------
// Resolve each part's props and state from the type checker
// ---------------------------------------------------------------------------

const roots = Object.keys(NAMESPACES).map((ns) => path.resolve(SRC, ns, "index.parts.ts"));
const config = ts.readConfigFile("packages/ui/tsconfig.json", ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, "packages/ui");
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();

const resolveParts = (root) => {
  const source = program.getSourceFile(root);
  const parts = {};
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
    const declaration = symbol.declarations?.[0];
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const type = checker.getTypeOfSymbolAtLocation(target, target.declarations?.[0] ?? declaration);
    const signature = type.getCallSignatures()[0];
    const parameter = signature?.getParameters()[0];
    if (!parameter) {
      parts[symbol.getName()] = { props: [], state: [] };
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
    parts[symbol.getName()] = {
      props: propsType.getProperties().map((p) => p.getName()),
      state,
    };
  }
  return parts;
};

// { Composer: { Root: { props, state }, … }, … }
const partsOf = Object.fromEntries(
  Object.entries(NAMESPACES).map(([slug, namespace]) => [
    namespace,
    resolveParts(path.resolve(SRC, slug, "index.parts.ts")),
  ]),
);

// ---------------------------------------------------------------------------
// What the package can emit: data-* attributes, CSS variables, entry points
// ---------------------------------------------------------------------------

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

// Bespoke part attributes appear either as quoted object keys or as JSX props.
// CSS variables appear only as quoted names.
const literals = new Set();
const cssVariables = new Set();
for (const file of walk(SRC)) {
  const body = readFileSync(file, "utf8");
  for (const [, a] of body.matchAll(/["'`](data-[a-z-]+)["'`]/g)) literals.add(a);
  for (const [, a] of body.matchAll(/(?<![\w"'-])(data-[a-z-]+)\s*[=:]/g)) literals.add(a);
  for (const [, v] of body.matchAll(/["'`](--[a-z][a-z0-9-]*[a-z0-9])["'`]/g)) cssVariables.add(v);
}

// Unmapped state keys become data-<key>; open and transitionStatus are mapped.
const attributesFor = ({ state }) => {
  const attributes = new Set(literals);
  for (const key of state) {
    if (key === "open") attributes.add("data-open").add("data-closed");
    else if (key === "transitionStatus")
      attributes.add("data-starting-style").add("data-ending-style");
    else attributes.add(`data-${key.toLowerCase()}`);
  }
  return attributes;
};

const anyPartAttributes = new Set(
  Object.values(partsOf).flatMap((parts) =>
    Object.values(parts).flatMap((part) => [...attributesFor(part)]),
  ),
);

const entryPoints = new Set(
  Object.keys(JSON.parse(readFileSync("packages/ui/package.json", "utf8")).exports).map(
    (key) => `@intentface/ui${key.slice(1)}`,
  ),
);

// ---------------------------------------------------------------------------
// Diff the pages
// ---------------------------------------------------------------------------

const auditPage = (slug, namespace) => {
  const parts = partsOf[namespace];
  const page = readFileSync(path.join(DOCS, "primitives", `${slug}.mdx`), "utf8");
  const findings = [];

  for (const block of page.split(/^### /m).slice(1)) {
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
      findings.push(`part does not exist: ${namespace}.${part}`);
      continue;
    }
    const { props } = parts[part];
    const attributes = attributesFor(parts[part]);

    for (const [, name] of section.matchAll(/\{\s*name:\s*"([^"]+)"/g)) {
      if (/[/\s]/.test(name)) continue; // rows naming several props at once
      if (!props.includes(name)) findings.push(`no such prop: ${namespace}.${part}.${name}`);
    }
    for (const [, attribute] of section.matchAll(/\{\s*attribute:\s*"(data-[^"]+)"/g)) {
      if (!attributes.has(attribute))
        findings.push(`never emitted: ${namespace}.${part} → ${attribute}`);
    }
  }

  // A part counts as covered by a prose mention; trivial sub-parts are grouped
  // rather than given a heading each.
  const uncovered = Object.keys(parts).filter(
    (part) => !page.includes(`${namespace}.${part}`) && part !== "Root",
  );
  for (const part of uncovered) findings.push(`undocumented: ${namespace}.${part}`);

  return findings;
};

// ---------------------------------------------------------------------------
// Diff the coding-agent skill
// ---------------------------------------------------------------------------

// Shell blocks hold CLI flags, which read like CSS variables.
const SHELL_BLOCK = /^```(?:sh|bash|shell|console)\n[\s\S]*?^```/gm;
const CODE_BLOCK = /^```\w*\n([\s\S]*?)^```/gm;
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

const auditSkillFile = (file) => {
  const text = readFileSync(file, "utf8");
  const findings = [];

  for (const [entry] of text.matchAll(/@intentface\/ui\/[a-z-]+/g)) {
    if (!entryPoints.has(entry)) findings.push(`no such entry point: ${entry}`);
  }
  for (const [name, namespace, part] of text.matchAll(PART)) {
    if (!partsOf[namespace][part]) findings.push(`part does not exist: ${name}`);
  }
  // Props are checked where a part receives them in JSX, because prose can't
  // say which part a bare prop name belongs to.
  for (const [tag, name] of snippetsOf(text).flatMap(jsxAttributes)) {
    const [namespace, part] = tag.split(".");
    const props = partsOf[namespace]?.[part]?.props;
    if (!props || name === "key" || name.startsWith("data-")) continue;
    if (!props.includes(name)) findings.push(`no such prop: ${tag}.${name}`);
  }
  // The plain name and Tailwind's arbitrary form: data-highlighted:, data-[role=user]:
  for (const [, arbitrary, plain] of text.matchAll(/\bdata-(?:\[([a-z-]+)|([a-z][a-z-]*[a-z]))/g)) {
    const attribute = `data-${arbitrary ?? plain}`;
    if (!anyPartAttributes.has(attribute)) findings.push(`never emitted: ${attribute}`);
  }
  // A variable the skill defines itself, as in [--header-height:3.5rem], is the
  // app's. A name followed by "(" is a function, such as Tailwind's --spacing().
  const code = text.replace(SHELL_BLOCK, "");
  const defined = new Set(
    [...code.matchAll(/(?:\[|^\s*|;\s*)(--[a-z][a-z0-9-]*[a-z0-9])\s*:/gm)].map(([, v]) => v),
  );
  for (const [, variable] of code.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*[a-z0-9])(?![\w(-])/g)) {
    if (!cssVariables.has(variable) && !defined.has(variable))
      findings.push(`never published: ${variable}`);
  }
  for (const [url, slug] of text.matchAll(new RegExp(`${SITE}/([\\w/-]+)\\.md`, "g"))) {
    if (!existsSync(path.join(DOCS, `${slug}.mdx`))) findings.push(`no such docs page: ${url}`);
  }

  return [...new Set(findings)];
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const audits = [
  ...Object.entries(NAMESPACES)
    .filter(([slug]) => !UNPAGED.has(slug))
    .map(([slug, namespace]) => [`${slug}.mdx`, auditPage(slug, namespace)]),
  ...readdirSync(SKILLS, { recursive: true })
    .filter((file) => file.endsWith(".md"))
    .map((file) => [path.join(SKILLS, file), auditSkillFile(path.join(SKILLS, file))]),
];

let failures = 0;
for (const [label, findings] of audits) {
  if (!findings.length) continue;
  failures += findings.length;
  console.error(`\n${label}`);
  for (const finding of findings) console.error(`  ✗ ${finding}`);
}

if (failures) {
  console.error(`\n${failures} contradiction(s) between the docs and the package.\n`);
  process.exit(1);
}
console.log(
  "Docs match the package: every documented part, prop, attribute and CSS variable resolves.",
);

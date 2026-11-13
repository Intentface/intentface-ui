// The catalog and the shapes the generative helpers read and return: what the
// model may use, the tree it writes, and the small lookups over both.

import type {
  InferInput,
  InferOutput,
  StandardJSONSchema,
  StandardSchema,
} from "../internal/standard-schema";

export type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * A component's schema: it validates the props, and converts to the JSON
 * Schema the model is shown. zod 4.2+ and ArkType 2.1.28+ do both; Valibot
 * through `toStandardJsonSchema`.
 */
export type ComponentSchema = StandardSchema & StandardJSONSchema;

type BindKey<Schema extends ComponentSchema> = unknown extends InferOutput<Schema>
  ? string
  : keyof InferOutput<Schema> & string;

/** One component the model may use. */
export type ComponentDefinition<Schema extends ComponentSchema = ComponentSchema> = {
  /** When to use it, written for the model. */
  description: string;
  /** Validates its props, and converts to the JSON Schema the model is shown. */
  props: Schema;
  /** Whether it holds other components. */
  container?: boolean;
  /** Props the model may point at data (`{ "$data": ref }`) instead of writing out. */
  bind?: readonly BindKey<Schema>[];
  /** How it reads as Markdown. `children` is its children's Markdown. */
  markdown?(props: InferOutput<Schema>, children: string): string;
};

/** The components the model may use, by type. */
export type Catalog<
  Schemas extends Record<string, ComponentSchema> = Record<string, ComponentSchema>,
> = {
  components: { [Type in keyof Schemas]: ComponentDefinition<Schemas[Type]> };
  /** Caps on one call, all checked. The node and children caps are also in the tool's schema. */
  limits?: Partial<Limits>;
  /** What a ref looks like, in the model's terms. */
  refDescription?: string;
};

// A key a component doesn't have is a typo: the catalog is typed exactly as
// written, so nothing else would catch it.
type NoOtherKeys<Components> = {
  [Type in keyof Components]: {
    [Key in Exclude<keyof Components[Type], keyof ComponentDefinition>]: never;
  };
};

/**
 * Types a catalog from each component's schema. The catalog stays plain data,
 * typed exactly as written, so the props each component binds are known too.
 */
export const defineCatalog = <
  Schemas extends Record<string, ComponentSchema>,
  const Written extends { components: Record<string, unknown> },
>(
  catalog: Written & Catalog<Schemas> & { components: NoOtherKeys<Written["components"]> },
): Written => catalog;

/** Any catalog: the bound for the helpers' type parameters, so every typed catalog fits. */
export type AnyCatalog = {
  components: Record<
    string,
    {
      description: string;
      props: ComponentSchema;
      container?: boolean;
      bind?: readonly string[];
      markdown?(props: never, children: string): string;
    }
  >;
  limits?: Partial<Limits>;
  refDescription?: string;
};

/** One component of any catalog, as the helpers read it. */
export type AnyComponent = AnyCatalog["components"][string];

/**
 * The component a type names, if it's one of the catalog's own. A name the
 * catalog only inherits, such as `"constructor"`, is not a component.
 */
export const componentOf = (catalog: AnyCatalog, type: unknown): AnyComponent | undefined =>
  typeof type === "string" && Object.hasOwn(catalog.components, type)
    ? catalog.components[type]
    : undefined;

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

type ComponentType<C extends AnyCatalog> = keyof C["components"] & string;

type PropsOf<C extends AnyCatalog, Type extends ComponentType<C>> = InferOutput<
  C["components"][Type]["props"]
>;

/** The props a component binds, from its `bind` as written. */
type BoundKey<C extends AnyCatalog, Type extends ComponentType<C>> = C["components"][Type] extends {
  bind?: infer Keys;
}
  ? Keys extends readonly (infer Key)[]
    ? Key
    : never
  : never;

/** A component's props in a checked tree: a prop it binds may still hold its binding. */
type CheckedProps<C extends AnyCatalog, Type extends ComponentType<C>> = unknown extends PropsOf<
  C,
  Type
>
  ? unknown
  : {
      [Key in keyof PropsOf<C, Type>]: Key extends BoundKey<C, Type>
        ? PropsOf<C, Type>[Key] | Binding
        : PropsOf<C, Type>[Key];
    };

/** One element of a checked tree. A prop its component binds may still hold its `Binding`. */
export type TreeElement<C extends AnyCatalog = AnyCatalog> = {
  [Type in ComponentType<C>]: { type: Type; props: CheckedProps<C, Type>; children?: string[] };
}[ComponentType<C>];

/** One element of a resolved tree: every prop holds its data. */
export type ResolvedTreeElement<C extends AnyCatalog = AnyCatalog> = {
  [Type in ComponentType<C>]: { type: Type; props: PropsOf<C, Type>; children?: string[] };
}[ComponentType<C>];

// A tree's shape, generic in its element. An interface rather than an alias, so
// TypeScript compares two trees by their elements, which widen, and not by
// their catalogs, which don't: a tree from a specific catalog fits `Tree`.
interface TreeOf<Element> {
  root: string;
  elements: Record<string, Element>;
}

/** A checked call: the root's id and every element by id. Plain JSON, safe to store. */
export type Tree<C extends AnyCatalog = AnyCatalog> = TreeOf<TreeElement<C>>;

/** A checked call with its bindings resolved, as `bindings.resolve` returns it. */
export type ResolvedTree<C extends AnyCatalog = AnyCatalog> = TreeOf<ResolvedTreeElement<C>>;

// ---------------------------------------------------------------------------
// What the model writes
// ---------------------------------------------------------------------------

// A strict schema makes every property required, so the model writes null for
// one it leaves out: an optional prop, or a binding's unused part.
type BindingInput = { $data: string; columns?: string[] | null; column?: string | null };

/** A component's props as its schema takes them in. */
type InputPropsOf<C extends AnyCatalog, Type extends ComponentType<C>> = InferInput<
  C["components"][Type]["props"]
>;

/** A component's props as the model writes them, per the tool's schema. */
type InputProps<C extends AnyCatalog, Type extends ComponentType<C>> = unknown extends InputPropsOf<
  C,
  Type
>
  ? unknown
  : {
      [Key in keyof InputPropsOf<C, Type>]:
        | InputPropsOf<C, Type>[Key]
        | (Key extends BoundKey<C, Type> ? BindingInput : never)
        | (undefined extends InputPropsOf<C, Type>[Key] ? null : never);
    };

/** Whether a component holds children, from its `container` as written. */
type IsContainer<
  C extends AnyCatalog,
  Type extends ComponentType<C>,
> = C["components"][Type] extends {
  container: true;
}
  ? true
  : false;

/**
 * One component on its own, as the model writes it when the tool's schema
 * comes from `tree.schema(catalog, { single: true })`.
 */
export type ComponentInput<C extends AnyCatalog = AnyCatalog> = {
  [Type in ComponentType<C>]: { type: Type; props: InputProps<C, Type> };
}[ComponentType<C>];

/** A call as the model writes it, per `tree.schema(catalog)`, which types a tool's input with it. */
export type TreeInput<C extends AnyCatalog = AnyCatalog> = {
  root: string;
  elements: {
    [Type in ComponentType<C>]: {
      id: string;
      type: Type;
      props: InputProps<C, Type>;
    } & (IsContainer<C, Type> extends true ? { children: string[] } : unknown);
  }[ComponentType<C>][];
};

/** One node, ready to draw. Its props are typed once its status is `ready`. */
export type TreeNode<C extends AnyCatalog = AnyCatalog> = {
  [Type in ComponentType<C>]:
    | {
        id: string;
        type: Type;
        status: "ready";
        props: PropsOf<C, Type>;
        children: TreeNode<C>[];
      }
    | { id: string; type: Type; status: "pending"; props: unknown; children: TreeNode<C>[] };
}[ComponentType<C>];

/** Caps on one call. The node and children caps are also in the tool's schema. */
export type Limits = { nodes: number; depth: number; children: number };

export const DEFAULT_LIMITS: Limits = { nodes: 40, depth: 6, children: 24 };

/** A catalog's limits, each one it leaves out at its default. */
export const limitsOf = (catalog: AnyCatalog): Limits => ({ ...DEFAULT_LIMITS, ...catalog.limits });

// ---------------------------------------------------------------------------
// Bindings

/** Data by reference: a tool result's ref, and the columns to pick from its rows. */
export type Binding = { $data: string; columns?: string[]; column?: string };

/** A binding found in a tree, and where it sits. */
export type FoundBinding = Binding & { id: string; prop: string };

export const DEFAULT_REF_DESCRIPTION = "Where the data comes from: its ref, exactly as given.";

export const isBinding = (value: unknown): value is Binding =>
  isObject(value) && typeof value.$data === "string";

import type { PrismTheme } from "prism-react-renderer";

/**
 * Custom Prism theme that maps token types to design-system CSS variables.
 * Variables resolve to the current [data-theme] so this works in both modes.
 *
 * Dependency justified: prism-react-renderer provides production-quality
 * tokenizers for TypeScript/JS/JSON/shell — well beyond 200 lines to replicate
 * internally.
 */
export const designTheme: PrismTheme = {
  plain: {
    color: "var(--color-text)",
    backgroundColor: "var(--color-surface-alt)",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "var(--color-dim)", fontStyle: "italic" },
    },
    {
      types: ["keyword", "operator", "tag", "selector", "important", "atrule"],
      style: { color: "var(--color-primary)" },
    },
    {
      types: ["string", "attr-value", "template-string", "attr-name"],
      style: { color: "var(--color-accent)" },
    },
    {
      types: ["number", "boolean", "regex", "constant"],
      style: { color: "var(--color-warn)" },
    },
    {
      types: ["function", "class-name", "builtin"],
      style: { color: "var(--color-primary)" },
    },
    {
      types: ["punctuation"],
      style: { color: "var(--color-dim)" },
    },
    {
      types: ["property", "variable", "parameter"],
      style: { color: "var(--color-text)" },
    },
  ],
};

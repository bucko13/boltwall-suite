"use client";

import { Highlight } from "prism-react-renderer";
import { useState } from "react";

import { designTheme } from "../../lib/highlight";

export type CodeSnippetLanguage = "typescript" | "javascript" | "shell" | "json";
export type CodeSnippetContract = "exact" | "current-input" | "recipe";

export type CodeSnippetProps = {
  language: CodeSnippetLanguage;
  /** Template string with {{key}} placeholders replaced by `values`. */
  template: string;
  /** Current values for placeholder substitution. */
  values: Record<string, string>;
  /**
   * Contract shown beside copy controls so snippets are not mistaken for exact
   * reproducers when they are only recipes.
   */
  contract?: CodeSnippetContract;
  copyable?: boolean;
};

const CONTRACT_LABELS: Record<CodeSnippetContract, string> = {
  exact: "exact code - reproduces this output",
  "current-input": "current input code - reflects form fields",
  recipe: "recipe code - fill generated values",
};

function substituteTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function CodeSnippet({
  language,
  template,
  values,
  contract = "current-input",
  copyable = true,
}: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);
  const code = substituteTemplate(template, values);

  function handleCopy() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <div data-testid="code-snippet" style={{ borderTop: "1px solid var(--color-border)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "7px 16px",
          background: "var(--color-surface-alt)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <span
            style={{
              fontSize: "var(--size-11)",
              color: "var(--color-dim)",
              fontFamily:
                "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
              textTransform: "uppercase",
              letterSpacing: 0,
            }}
          >
            {language}
          </span>
          <span
            data-testid="code-snippet-contract"
            style={{
              fontSize: "var(--size-11)",
              color: "var(--color-dim)",
              fontFamily:
                "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {CONTRACT_LABELS[contract]}
          </span>
        </div>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            data-testid="code-snippet-copy"
            aria-label="Copy code"
            style={{
              padding: "2px 8px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              fontSize: "var(--size-11)",
              color: copied ? "var(--color-accent)" : "var(--color-dim)",
              cursor: "pointer",
            }}
          >
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>

      <Highlight theme={designTheme} code={code} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className}
            tabIndex={0}
            aria-label="Code snippet"
            style={{
              ...style,
              margin: 0,
              padding: "12px 16px",
              fontFamily:
                "var(--font-geist-mono), 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
              fontSize: "var(--size-12-5)",
              lineHeight: 1.6,
              overflowX: "auto",
              borderRadius: 0,
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

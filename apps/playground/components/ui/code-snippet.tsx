"use client";

import { Highlight } from "prism-react-renderer";
import { useState } from "react";

import { designTheme } from "../../lib/highlight";

export type CodeSnippetLanguage = "typescript" | "javascript" | "shell" | "json";

export type CodeSnippetProps = {
  language: CodeSnippetLanguage;
  /** Template string with {{key}} placeholders replaced by `values`. */
  template: string;
  /** Current values for placeholder substitution. */
  values: Record<string, string>;
  copyable?: boolean;
};

function substituteTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function CodeSnippet({
  language,
  template,
  values,
  copyable = true,
}: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);
  const code = substituteTemplate(template, values);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div
      data-testid="code-snippet"
      style={{ position: "relative", borderTop: "1px solid var(--color-border)" }}
    >
      <Highlight theme={designTheme} code={code} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className}
            style={{
              ...style,
              margin: 0,
              padding: "12px 16px",
              paddingRight: copyable ? 60 : 16,
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

      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          data-testid="code-snippet-copy"
          aria-label="Copy code"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
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
  );
}

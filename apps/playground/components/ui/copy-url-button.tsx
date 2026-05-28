"use client";

import { useState } from "react";

import { copyUrl } from "../../lib/copy-url";

export function CopyUrlButton({
  label = "copy url",
  title = "Copy share-state URL",
  sensitiveStateWarning,
}: {
  label?: string;
  title?: string;
  sensitiveStateWarning?: string;
}) {
  const [copied, setCopied] = useState(false);
  const buttonTitle = sensitiveStateWarning ? `${title}. ${sensitiveStateWarning}` : title;

  async function onCopy() {
    try {
      await copyUrl();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {sensitiveStateWarning ? (
        <span
          data-testid="copy-url-sensitive-warning"
          title={sensitiveStateWarning}
          aria-label={sensitiveStateWarning}
          role="img"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            border: "1px solid var(--color-warn)",
            borderRadius: 4,
            background: "var(--color-warn-soft)",
            color: "var(--color-warn)",
            fontSize: "var(--size-12)",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          !
        </span>
      ) : null}
      <button
        type="button"
        onClick={onCopy}
        data-testid="copy-url-button"
        aria-label="Copy URL to share current state"
        title={buttonTitle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 10px",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          background: "var(--color-surface)",
          color: copied ? "var(--color-accent)" : "var(--color-dim)",
          fontSize: "var(--size-12)",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "copied" : label}
      </button>
    </span>
  );
}

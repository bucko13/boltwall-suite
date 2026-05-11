"use client";

import { useState } from "react";

import { copyUrl } from "../../lib/copy-url";

export function CopyUrlButton({
  label = "copy url",
  title = "Copy share-state URL",
}: {
  label?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

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
    <button
      type="button"
      onClick={onCopy}
      data-testid="copy-url-button"
      aria-label="Copy URL to share current state"
      title={title}
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
  );
}

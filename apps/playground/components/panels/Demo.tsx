"use client";

import { useEffect, useState } from "react";

import { Cell } from "../ui/cell";
import { CodeSnippet } from "../ui/code-snippet";
import { HeaderRow } from "../ui/header-row";
import { StatusPill } from "../ui/status-pill";

type WebLNNodeInfo = {
  alias?: string;
  pubkey?: string;
  color?: string;
};

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      getInfo(): Promise<{ node: WebLNNodeInfo }>;
    };
  }
}

export function Demo() {
  const [detected, setDetected] = useState<boolean | null>(null);
  const [nodeInfo, setNodeInfo] = useState<WebLNNodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setDetected(typeof window !== "undefined" && !!window.webln);
  }, []);

  async function connect() {
    if (!window.webln) {
      setError("WebLN not detected.");
      return;
    }
    setConnecting(true);
    setError(null);
    setNodeInfo(null);
    try {
      await window.webln.enable();
      const info = await window.webln.getInfo();
      setNodeInfo(info.node);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  const status = error ? "fail" : nodeInfo ? "pass" : detected === false ? "warn" : "idle";
  const statusLabel = error
    ? "error"
    : nodeInfo
      ? "connected"
      : detected === false
        ? "no webln"
        : connecting
          ? "connecting"
          : "idle";

  return (
    <Cell
      header={
        <HeaderRow
          title="Demo"
          subtitle="WebLN wallet connect with live Lightning node info"
          trailing={<StatusPill state={status}>{statusLabel}</StatusPill>}
        />
      }
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {detected === false ? (
            <div
              data-testid="demo-no-webln"
              style={{
                padding: "12px 16px",
                background: "var(--color-warn-soft)",
                border: "1px solid var(--color-warn)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
                color: "var(--color-warn)",
              }}
            >
              WebLN not detected. Install a Lightning browser extension (e.g.{" "}
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-warn)", textDecoration: "underline" }}
              >
                Alby
              </a>
              ) to use this panel.
            </div>
          ) : null}

          <button
            type="button"
            onClick={connect}
            disabled={connecting || detected === false}
            data-testid="demo-connect"
            style={{
              padding: "8px 16px",
              background: detected === false ? "var(--color-surface-alt)" : "var(--color-primary)",
              color: detected === false ? "var(--color-dim)" : "var(--color-surface)",
              border: "none",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              fontWeight: 500,
              cursor: detected === false ? "not-allowed" : "pointer",
              opacity: connecting ? 0.7 : 1,
              alignSelf: "flex-start",
            }}
          >
            {connecting ? "Connecting..." : "Connect WebLN"}
          </button>

          {error ? (
            <div
              data-testid="demo-error"
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          ) : null}

          {nodeInfo ? (
            <div
              data-testid="demo-output"
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr",
                gap: "6px 12px",
                padding: "12px 14px",
                background: "var(--color-accent-soft)",
                border: "1px solid var(--color-accent)",
                borderRadius: 4,
                fontSize: "var(--size-13)",
              }}
            >
              <span style={{ color: "var(--color-dim)" }}>alias</span>
              <span>{nodeInfo.alias ?? "(none)"}</span>
              <span style={{ color: "var(--color-dim)" }}>pubkey</span>
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                  fontSize: "var(--size-12)",
                  wordBreak: "break-all",
                }}
              >
                {nodeInfo.pubkey ?? "(none)"}
              </span>
              {nodeInfo.color ? (
                <>
                  <span style={{ color: "var(--color-dim)" }}>color</span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: 2,
                        background: nodeInfo.color,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                    {nodeInfo.color}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      }
      code={
        <CodeSnippet
          language="typescript"
          template={`// WebLN browser extension API\nif (typeof window.webln !== "undefined") {\n  await window.webln.enable();\n  const { node } = await window.webln.getInfo();\n  console.log(node.alias, node.pubkey);\n}`}
          values={{}}
        />
      }
    />
  );
}

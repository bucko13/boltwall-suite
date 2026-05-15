"use client";

import { useEffect, useState } from "react";

import {
  fetchPaidResource,
  parsePastedPreimage,
  retryWithCredential,
} from "../lib/payment";

/**
 * WebLN provider surface used by this component.
 *
 * Locally typed (rather than relying on a global `declare`) so the file
 * stays self-contained and does not conflict with the existing
 * `Window["webln"]` augmentation in `components/panels/Demo.tsx`.
 */
interface WebLnHandle {
  enable(): Promise<unknown>;
  sendPayment(invoice: string): Promise<{ preimage: string }>;
}

function getWebLn(): WebLnHandle | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as { webln?: unknown }).webln;
  if (typeof candidate !== "object" || candidate === null) return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.enable !== "function") return null;
  if (typeof record.sendPayment !== "function") return null;
  return candidate as WebLnHandle;
}

type Status =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "awaiting-payment"; invoice: string; macaroon: string; scheme: "L402" | "LSAT" }
  | { kind: "paying" }
  | { kind: "ok"; body: string }
  | { kind: "error"; message: string };

export interface PaymentFlowProps {
  /** Endpoint to fetch through the L402 challenge → pay → retry flow. */
  endpoint: string;
  /** Optional label used in the trigger button. */
  label?: string;
}

/**
 * Self-contained UI for the L402 pay-and-retry flow against a single
 * endpoint. Detects WebLN at mount time and re-checks on each click so
 * extensions that inject lazily are picked up. Always exposes the manual
 * paste-preimage fallback alongside the WebLN button so users without a
 * compatible extension can complete the flow with any wallet.
 *
 * `data-testid` hooks are provided for Playwright e2e.
 */
export function PaymentFlow({ endpoint, label = "Get resource" }: PaymentFlowProps) {
  const [webLnDetected, setWebLnDetected] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pastedPreimage, setPastedPreimage] = useState("");

  useEffect(() => {
    setWebLnDetected(getWebLn() !== null);
  }, []);

  async function start() {
    setStatus({ kind: "fetching" });
    try {
      const result = await fetchPaidResource(endpoint);
      if (result.status === "ok") {
        const body = await result.response.text();
        setStatus({ kind: "ok", body });
        return;
      }
      if (result.status === "error") {
        const text = await result.response.text();
        setStatus({
          kind: "error",
          message: `request failed ${String(result.response.status)}: ${text}`,
        });
        return;
      }
      setWebLnDetected(getWebLn() !== null);
      setPastedPreimage("");
      setStatus({
        kind: "awaiting-payment",
        invoice: result.challenge.invoice,
        macaroon: result.challenge.macaroon,
        scheme: result.challenge.scheme,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function payWithWebLn() {
    if (status.kind !== "awaiting-payment") return;
    const webln = getWebLn();
    if (webln === null) {
      setStatus({ kind: "error", message: "WebLN not detected" });
      return;
    }
    const { invoice, macaroon, scheme } = status;
    setStatus({ kind: "paying" });
    try {
      await webln.enable();
      const { preimage } = await webln.sendPayment(invoice);
      await retryAndRender({ macaroon, scheme }, preimage);
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function submitPastedPreimage() {
    if (status.kind !== "awaiting-payment") return;
    let preimage: string;
    try {
      preimage = parsePastedPreimage(pastedPreimage);
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const { macaroon, scheme } = status;
    setStatus({ kind: "paying" });
    try {
      await retryAndRender({ macaroon, scheme }, preimage);
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function retryAndRender(
    challenge: { macaroon: string; scheme: "L402" | "LSAT" },
    preimage: string,
  ) {
    const result = await retryWithCredential(
      endpoint,
      {},
      { ...challenge, invoice: "" },
      preimage,
    );
    if (result.status === "paid") {
      const body = await result.response.text();
      setStatus({ kind: "ok", body });
      return;
    }
    const text = await result.response.text();
    setStatus({
      kind: "error",
      message: `retry returned ${String(result.response.status)}: ${text}`,
    });
  }

  const startDisabled = status.kind === "fetching" || status.kind === "paying";
  const pasteDisabled = pastedPreimage.trim() === "" || status.kind === "paying";
  const weblnDisabled = webLnDetected === false || status.kind === "paying";

  return (
    <section
      data-testid="payment-flow"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
      }}
    >
      <button
        type="button"
        onClick={() => {
          void start();
        }}
        disabled={startDisabled}
        data-testid="payment-flow-start"
        style={{
          padding: "8px 16px",
          background: "var(--color-primary)",
          color: "var(--color-surface)",
          border: "none",
          borderRadius: 4,
          fontSize: "var(--size-13)",
          fontWeight: 500,
          cursor: startDisabled ? "not-allowed" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {label}
      </button>

      {status.kind === "awaiting-payment" ? (
        <div
          data-testid="payment-flow-challenge"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px 14px",
            background: "var(--color-accent-soft)",
            border: "1px solid var(--color-accent)",
            borderRadius: 4,
            fontSize: "var(--size-13)",
          }}
        >
          <div>
            <strong>402 challenge received.</strong> Pay the invoice and retry.
          </div>
          <code
            data-testid="payment-flow-invoice"
            style={{
              fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
              fontSize: "var(--size-12)",
              wordBreak: "break-all",
              background: "var(--color-surface)",
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
            }}
          >
            {status.invoice}
          </code>

          <button
            type="button"
            onClick={() => {
              void payWithWebLn();
            }}
            disabled={weblnDisabled}
            data-testid="payment-flow-webln"
            style={{
              padding: "8px 16px",
              background: weblnDisabled ? "var(--color-surface-alt)" : "var(--color-primary)",
              color: weblnDisabled ? "var(--color-dim)" : "var(--color-surface)",
              border: "none",
              borderRadius: 4,
              fontSize: "var(--size-13)",
              fontWeight: 500,
              cursor: weblnDisabled ? "not-allowed" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {webLnDetected === false ? "WebLN unavailable" : "Pay with WebLN"}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={pastedPreimage}
              onChange={(event) => setPastedPreimage(event.target.value)}
              placeholder="paste 64-char hex preimage"
              data-testid="payment-flow-preimage-input"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
                fontSize: "var(--size-12)",
              }}
            />
            <button
              type="button"
              onClick={() => {
                void submitPastedPreimage();
              }}
              disabled={pasteDisabled}
              data-testid="payment-flow-preimage-submit"
              style={{
                padding: "8px 16px",
                background: pasteDisabled
                  ? "var(--color-surface-alt)"
                  : "var(--color-primary)",
                color: pasteDisabled ? "var(--color-dim)" : "var(--color-surface)",
                border: "none",
                borderRadius: 4,
                fontSize: "var(--size-13)",
                fontWeight: 500,
                cursor: pasteDisabled ? "not-allowed" : "pointer",
              }}
            >
              Submit preimage
            </button>
          </div>
        </div>
      ) : null}

      {status.kind === "ok" ? (
        <pre
          data-testid="payment-flow-result"
          style={{
            margin: 0,
            padding: "12px 14px",
            background: "var(--color-surface-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace",
            fontSize: "var(--size-12)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {status.body}
        </pre>
      ) : null}

      {status.kind === "error" ? (
        <div
          data-testid="payment-flow-error"
          style={{
            fontSize: "var(--size-13)",
            color: "var(--color-danger)",
            padding: "8px 12px",
            background: "var(--color-danger-soft)",
            border: "1px solid var(--color-danger)",
            borderRadius: 4,
          }}
        >
          {status.message}
        </div>
      ) : null}
    </section>
  );
}

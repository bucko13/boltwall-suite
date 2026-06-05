"use client";

import { QRCodeSVG } from "qrcode.react";

export interface InvoiceQrCodeProps {
  invoice: string;
  testId: string;
}

export function InvoiceQrCode({ invoice, testId }: InvoiceQrCodeProps) {
  return (
    <div
      data-testid={testId}
      data-invoice={invoice}
      aria-label="Lightning invoice QR code"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 168,
        minWidth: 168,
        minHeight: 168,
        padding: 8,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
      }}
    >
      <QRCodeSVG
        value={invoice}
        size={148}
        marginSize={1}
        bgColor="transparent"
        fgColor="currentColor"
        title="Lightning invoice"
      />
    </div>
  );
}

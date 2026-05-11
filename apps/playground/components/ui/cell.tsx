import type { ReactNode } from "react";

export function Cell({
  header,
  body,
  code,
}: {
  header: ReactNode;
  body: ReactNode;
  code?: ReactNode;
}) {
  return (
    <section
      data-testid="cell"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 0,
      }}
    >
      {header}
      <div style={{ padding: "12px 16px" }}>{body}</div>
      {code}
    </section>
  );
}

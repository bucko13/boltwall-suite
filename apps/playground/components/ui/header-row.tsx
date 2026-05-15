import type { ReactNode } from "react";

export function HeaderRow({
  title,
  subtitle,
  trailing,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      data-testid="header-row"
      className="panel-header-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 40,
        padding: "0 16px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <div
        className="panel-header-title-group"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          minWidth: 0,
        }}
      >
        <span
          className="panel-header-title"
          style={{
            fontSize: "var(--size-14)",
            fontWeight: 500,
            color: "var(--color-text)",
          }}
        >
          {title}
        </span>
        {subtitle ? (
          <span
            className="panel-header-subtitle"
            style={{
              fontSize: "var(--size-12)",
              color: "var(--color-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
      {trailing ? (
        <div
          className="panel-header-trailing"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

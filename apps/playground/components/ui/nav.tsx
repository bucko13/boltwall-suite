import { LogoBeaker } from "./logo-beaker";
import { ThemeToggle } from "./theme-toggle";

const PANEL_LINKS = [
  { label: "signing key", href: "/p/signing-key" },
  { label: "from invoice", href: "/p/from-invoice" },
  { label: "from challenge", href: "/p/from-challenge" },
  { label: "parse token", href: "/p/parse-token" },
  { label: "caveats", href: "/p/caveats" },
  { label: "expiration", href: "/p/add-expiration" },
  { label: "validate", href: "/p/validate" },
  { label: "satisfy", href: "/p/satisfy" },
  { label: "demo", href: "/p/demo" },
];

const META_LINKS = [
  { label: "docs", href: "#" },
  { label: "spec", href: "#" },
  { label: "github", href: "#" },
];

export function Nav() {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "12px 24px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
      aria-label="Primary"
    >
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "var(--color-text)",
        }}
        aria-label="Playground home"
      >
        <LogoBeaker size={22} />
        <span style={{ fontSize: "var(--size-14)", fontWeight: 500 }}>playground</span>
      </a>

      <ul
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          listStyle: "none",
          margin: 0,
          padding: 0,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {PANEL_LINKS.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <ul
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {META_LINKS.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              style={{
                fontSize: "var(--size-12)",
                color: "var(--color-dim)",
              }}
            >
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <ThemeToggle />
        </li>
      </ul>
    </nav>
  );
}

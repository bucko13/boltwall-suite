"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoBeaker } from "./logo-beaker";
import { ThemeToggle } from "./theme-toggle";

const PANEL_LINKS = [
  { label: "Signing Key", href: "/p/signing-key" },
  { label: "Generate L402 Token", href: "/p/from-invoice" },
  { label: "From Challenge", href: "/p/from-challenge" },
  { label: "Parse Token", href: "/p/parse-token" },
  { label: "Caveat Builder", href: "/p/caveats" },
  { label: "Valid-until Caveat", href: "/p/add-expiration" },
  { label: "Validate L402", href: "/p/validate" },
  { label: "Caveat Satisfiers", href: "/p/satisfy" },
  { label: "Demo", href: "/p/demo" },
];

const META_LINKS = [
  { label: "docs", href: "#" },
  {
    label: "spec",
    href: "https://github.com/lightninglabs/L402/blob/master/protocol-specification.md",
  },
  { label: "github", href: "https://github.com/bucko13/boltwall-suite" },
];

export function Nav() {
  const pathname = usePathname();

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
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
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
      </Link>

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
            <Link
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              data-testid={`nav-link-${link.href.split("/").at(-1)}`}
              style={{
                fontSize: "var(--size-12)",
                color: pathname === link.href ? "var(--color-primary)" : "var(--color-dim)",
                fontWeight: pathname === link.href ? 600 : 400,
                whiteSpace: "nowrap",
                textDecoration: pathname === link.href ? "underline" : "none",
                textUnderlineOffset: 4,
              }}
            >
              {link.label}
            </Link>
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
              target={link.href === "#" ? undefined : "_blank"}
              rel={link.href === "#" ? undefined : "noreferrer"}
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

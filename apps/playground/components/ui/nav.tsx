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
  { label: "Caveats", href: "/p/caveats" },
  { label: "Add Expiration", href: "/p/add-expiration" },
  { label: "Validate L402", href: "/p/validate" },
  { label: "Satisfy L402", href: "/p/satisfy" },
  { label: "Demo", href: "/p/demo" },
];

const META_LINKS = [
  { label: "docs", href: "#" },
  { label: "spec", href: "#" },
  { label: "github", href: "#" },
];

type BuildProvenanceItem = {
  id: string;
  name: string;
  version: string;
  commit: string;
};

type NavProps = {
  provenance: ReadonlyArray<BuildProvenanceItem>;
};

export function Nav({ provenance }: NavProps) {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 24,
        rowGap: 10,
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

      <dl
        aria-label="Build provenance"
        data-testid="build-provenance"
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 14px",
          margin: 0,
          paddingTop: 10,
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-dim)",
        }}
      >
        {provenance.map((item) => (
          <div
            key={item.id}
            aria-label={`${item.name} version ${item.version} commit ${item.commit}`}
            data-testid={`provenance-${item.id}`}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              minWidth: 0,
            }}
          >
            <dt
              style={{
                fontSize: "var(--size-11)",
                fontWeight: 500,
                color: "var(--color-text)",
              }}
            >
              {item.name}
            </dt>
            <dd
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                margin: 0,
                fontSize: "var(--size-11)",
                whiteSpace: "nowrap",
              }}
            >
              <span data-testid={`provenance-${item.id}-version`}>v{item.version}</span>
              <span aria-hidden="true">/</span>
              <span data-testid={`provenance-${item.id}-commit`}>{item.commit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </nav>
  );
}

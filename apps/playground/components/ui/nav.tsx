"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LogoBeaker } from "./logo-beaker";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  id: string;
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "generate", label: "Generate", href: "/p/generate" },
  { id: "parse", label: "Parse", href: "/p/parse" },
  { id: "caveats", label: "Caveats", href: "/p/caveats" },
  { id: "validate", label: "Validate", href: "/p/validate" },
  { id: "demo", label: "Demo", href: "/p/demo" },
];

const META_LINKS = [
  {
    label: "docs",
    href: "https://github.com/bucko13/boltwall-suite/blob/main/docs/playground-design-system.md",
  },
  {
    label: "spec",
    href: "https://github.com/lightninglabs/L402/blob/master/protocol-specification.md",
  },
  { label: "github", href: "https://github.com/bucko13/boltwall-suite" },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function isActive(item: NavItem) {
    return item.href === pathname;
  }

  return (
    <nav
      className="playground-nav"
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
        className="playground-nav-home"
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

      <button
        ref={mobileButtonRef}
        type="button"
        className="playground-nav-menu-button"
        data-testid="mobile-nav-open"
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        aria-controls="playground-mobile-nav"
        onClick={() => setMobileOpen(true)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <ul
        className="playground-nav-panel-list"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          listStyle: "none",
          margin: 0,
          padding: 0,
          flex: 1,
          minWidth: 0,
          overflow: "visible",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <li key={item.id} data-active={isActive(item) ? "true" : undefined}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              data-testid={`nav-link-${item.id}`}
              className="playground-nav-panel-link"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      <ul
        className="playground-nav-meta"
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
              target="_blank"
              rel="noreferrer"
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

      {mobileOpen ? (
        <div
          className="playground-mobile-nav-overlay"
          data-testid="mobile-nav-overlay"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      {mobileOpen ? (
        <div
          id="playground-mobile-nav"
          className="playground-mobile-drawer"
          data-testid="mobile-nav-drawer"
        >
          <div className="playground-mobile-drawer-header">
            <span>Navigation</span>
            <button
              type="button"
              data-testid="mobile-nav-close"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
            >
              x
            </button>
          </div>

          <div className="playground-mobile-nav-groups">
            {NAV_ITEMS.map((item) => (
              <div key={item.id} data-active={isActive(item) ? "true" : undefined}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  data-testid={`mobile-nav-link-${item.id}`}
                  className="playground-mobile-nav-link"
                >
                  {item.label}
                </Link>
              </div>
            ))}
          </div>

          <div className="playground-mobile-nav-meta">
            {META_LINKS.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </nav>
  );
}

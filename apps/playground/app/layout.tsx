import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import l402Package from "../../../packages/l402/package.json";
import { Nav } from "../components/ui/nav";
import { ThemeProvider, themeBootstrapScript } from "../components/ui/theme-provider";
import { playgroundThemeCss } from "../lib/theme-tokens";
import playgroundPackage from "../package.json";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "playground",
  description: "Interactive browser tools for the L402 Lightning authentication protocol.",
};

type RootLayoutProps = {
  children: ReactNode;
};

function shortCommit(value: string | undefined): string {
  if (!value) {
    return "local";
  }

  return value.slice(0, 7);
}

const deploymentCommit =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA;

// Provenance contract: versions come from package manifests; commits come from
// explicit per-surface env vars, then the deployment SHA, then local fallback.
const buildProvenance = [
  {
    id: "l402",
    name: "@boltwall/l402",
    version: l402Package.version,
    commit: shortCommit(
      process.env.NEXT_PUBLIC_BOLTWALL_L402_COMMIT_SHA ??
        process.env.BOLTWALL_L402_COMMIT_SHA ??
        deploymentCommit,
    ),
  },
  {
    id: "playground",
    name: "playground",
    version: playgroundPackage.version,
    commit: shortCommit(
      process.env.NEXT_PUBLIC_BOLTWALL_PLAYGROUND_COMMIT_SHA ??
        process.env.BOLTWALL_PLAYGROUND_COMMIT_SHA ??
        deploymentCommit,
    ),
  },
] as const;

type BuildProvenanceItem = (typeof buildProvenance)[number];

function BuildProvenanceFooter({ items }: { items: ReadonlyArray<BuildProvenanceItem> }) {
  return (
    <footer
      aria-label="Build provenance"
      data-testid="build-provenance"
      style={{
        flexShrink: 0,
        display: "flex",
        justifyContent: "center",
        padding: "16px 24px",
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-page)",
        color: "var(--color-dim)",
      }}
    >
      <dl
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px 16px",
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((item) => (
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
                color: "var(--color-dim)",
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
    </footer>
  );
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <style
          id="playground-theme-tokens"
          dangerouslySetInnerHTML={{ __html: playgroundThemeCss }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) inject attributes onto <body> after SSR, which
          would otherwise trip a React hydration-mismatch warning. */}
      <body suppressHydrationWarning>
        <NuqsAdapter>
          <ThemeProvider>
            <Nav />
            <div
              style={{
                minHeight: "calc(100vh - 49px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ flex: "1 0 auto" }}>{children}</div>
              <BuildProvenanceFooter items={buildProvenance} />
            </div>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}

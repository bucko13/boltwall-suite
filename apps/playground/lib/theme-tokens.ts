type ThemeName = "light" | "dark";

type CssVariableName = `--${string}`;

type CssTokenMap = Readonly<Record<CssVariableName, string>>;

export const playgroundColorTokens = {
  light: {
    "--color-surface": "#ffffff",
    "--color-surface-alt": "#f4f4f2",
    "--color-page": "#fafaf9",
    "--color-border": "#e7e5e0",
    "--color-text": "#0c0c0c",
    "--color-dim": "#71706a",
    "--color-primary": "#1d6fb8",
    "--color-accent": "#0b6b3a",
    "--color-accent-soft": "#dff4e9",
    "--color-warn": "#7a5700",
    "--color-warn-soft": "#fbf0d9",
    "--color-danger": "#a92b25",
    "--color-danger-soft": "#fbe4e2",
  },
  dark: {
    "--color-surface": "#121412",
    "--color-surface-alt": "#171918",
    "--color-page": "#0c0d0c",
    "--color-border": "#22251f",
    "--color-text": "#ececea",
    "--color-dim": "#8b8a85",
    "--color-primary": "#8ab4f8",
    "--color-accent": "#5ee58a",
    "--color-accent-soft": "color-mix(in srgb, var(--color-accent) 14%, transparent)",
    "--color-warn": "#f3c65e",
    "--color-warn-soft": "color-mix(in srgb, var(--color-warn) 14%, transparent)",
    "--color-danger": "#ff8a80",
    "--color-danger-soft": "color-mix(in srgb, var(--color-danger) 14%, transparent)",
  },
} as const satisfies Readonly<Record<ThemeName, CssTokenMap>>;

export const playgroundTypeScaleTokens = {
  "--size-10": "10px",
  "--size-11": "11px",
  "--size-12": "12px",
  "--size-12-5": "12.5px",
  "--size-13": "13px",
  "--size-13-5": "13.5px",
  "--size-14": "14px",
  "--size-15": "15px",
  "--size-16": "16px",
  "--size-20": "20px",
  "--size-28": "28px",
  "--size-36": "36px",
  "--size-44": "44px",
} as const satisfies CssTokenMap;

function serializeTokens(tokens: CssTokenMap): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

export const playgroundThemeCss = `
:root,
html[data-theme="light"] {
${serializeTokens(playgroundColorTokens.light)}
  color-scheme: light;
}

html[data-theme="dark"] {
${serializeTokens(playgroundColorTokens.dark)}
  color-scheme: dark;
}

:root {
${serializeTokens(playgroundTypeScaleTokens)}
}
`;

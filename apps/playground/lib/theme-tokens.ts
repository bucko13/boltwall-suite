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

/**
 * The single knob for the whole type scale. Every `--size-*` token is this
 * factor times its historical px value, emitted in rem. Bump this one number to
 * resize all app text proportionally; 1.0 reproduces the original pixel scale.
 */
const TYPE_SCALE_FACTOR = 1.15;

/** Root font size (px) the rem outputs are relative to — the browser default. */
const ROOT_FONT_PX = 16;

/**
 * Historical step sizes (px) the token names are derived from. The names encode
 * these base values (`--size-13` = 13px at factor 1.0); the rhythm between steps
 * is preserved so a factor bump scales every step uniformly.
 */
const TYPE_SCALE_BASE_PX = {
  "--size-10": 10,
  "--size-11": 11,
  "--size-12": 12,
  "--size-12-5": 12.5,
  "--size-13": 13,
  "--size-13-5": 13.5,
  "--size-14": 14,
  "--size-15": 15,
  "--size-16": 16,
  "--size-20": 20,
  "--size-28": 28,
  "--size-36": 36,
  "--size-44": 44,
} as const satisfies Readonly<Record<CssVariableName, number>>;

/** Round to 4 decimals so serialized rem values stay stable and tidy. */
function toRem(px: number): string {
  return `${Math.round((px / ROOT_FONT_PX) * 10000) / 10000}rem`;
}

/**
 * Type-scale CSS custom properties, derived from {@link TYPE_SCALE_BASE_PX} by
 * {@link TYPE_SCALE_FACTOR} and emitted in rem. Token names are unchanged, so
 * every existing `var(--size-NN)` reference inherits the new size automatically.
 */
export const playgroundTypeScaleTokens: CssTokenMap = Object.fromEntries(
  Object.entries(TYPE_SCALE_BASE_PX).map(([name, px]) => [name, toRem(px * TYPE_SCALE_FACTOR)]),
);

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

# Playground Design System

Normative specification for the Boltwall playground local L402 workbench.
Downstream implementation work reads this document as the single source of
truth. The illustrative HTML references in
`apps/playground/design/reference/` are visual evidence; this document is
normative when the two ever disagree.

**Supersedes** `docs/playground-visual-concepts.md` (Concept D / Color Grid).
The visual-concepts doc is retained as historical reference only; see its
"Superseded" section.

## 1. Principles

Three rules, in order. Every later decision in this document is read through
them.

1. **Quiet by default.** The interface should look almost empty until the user
   interacts with it. No decorative gradients, no drop shadows except focus and
   hover rings, no marketing surface area. Chrome recedes; data steps forward.
2. **Data is the hero.** Macaroons, invoices, preimages, identifiers, and
   caveats are the content of every panel. Their raw bytes are presented as
   first-class typography in a monospace face, with copy and view-mode controls
   one keystroke away. Nothing in the visual frame should compete with the data.
3. **Cells, not pages.** The workbench is a grid of self-contained Cells, not a
   set of long-form pages. A Cell is a finite, named, addressable unit of state
   that exposes its input, output, view modes, and a "copy URL to share state"
   affordance. Pages are just compositions of Cells.

These principles are referenced by name throughout the document. When in doubt,
the principle wins over the rule.

---

## 2. Identity

- **Logo:** a single beaker glyph. No wordmark. No tagline.
- **Product name in the page chrome:** plain text `playground`, lowercase,
  Geist sans, no logotype treatment, no marketing copy adjacent to it.
- **No "lsat" branding in user-visible chrome.** The workbench is an L402
  workbench. Where the original `lsat-playground` legacy identity must be
  referenced (e.g., compatibility docs), it is referenced in body prose, not in
  the navigation or hero.

---

## 3. Color tokens

Token names are stable. The spec lists 12 tokens; light and dark theme each
assigns one hex value to each token. The hex values below are extracted from
`apps/playground/design/reference/tokens.html`. Implementations MUST use these
token names in CSS custom properties (`--color-text`, etc.) and MUST NOT
inline hex values in component code outside the token layer.

### 3.1 Light theme

| Token         | Hex       | Usage                                                         |
| ------------- | --------- | ------------------------------------------------------------- |
| `surface`     | `#ffffff` | Cell background, default page-content surface                 |
| `surface-alt` | `#f4f4f2` | Page background, recessed wells, code-strip background        |
| `border`      | `#e7e5e0` | Cell border, header-row underline, divider hairlines          |
| `text`        | `#0c0c0c` | Primary text, headings, raw data values                       |
| `dim`         | `#71706a` | Labels, secondary text, dim metadata                          |
| `primary`     | `#1d6fb8` | Primary action buttons, selected nav, focus ring              |
| `accent`      | `#198754` | Positive status (valid signature, satisfied caveat)           |
| `accent-soft` | `#dff4e9` | Background tint for positive status pills and caveat chips    |
| `warn`        | `#b78107` | Warning status, attention-needed indicator                    |
| `warn-soft`   | `#fbf0d9` | Background tint for warning pills                             |
| `danger`      | `#c2362f` | Failed validation, tampered-segment indicator, destructive UI |
| `danger-soft` | `#fbe4e2` | Background tint for danger pills and danger chip backgrounds  |

The top of the light page (the surface visible on first paint) is `#fafaf9` —
this is the page-frame outermost background and is identical to `surface-alt`
for implementation purposes; production may either map `surface-alt` to
`#fafaf9` or use `#f4f4f2` for recessed wells. The reference HTML uses both
shades but with the same role.

A secondary purple accent `#8a3aa8` appears in the reference for the macaroon
stripe `seg-caveat` segment (see §6). It is not a top-level color token; it is
a stripe-segment color and lives in §6's table.

### 3.2 Dark theme

| Token         | Hex       | Usage                                                           |
| ------------- | --------- | --------------------------------------------------------------- |
| `surface`     | `#121412` | Cell background                                                 |
| `surface-alt` | `#171918` | Page background, recessed wells, code-strip background          |
| `border`      | `#22251f` | Cell border, header-row underline, divider hairlines            |
| `text`        | `#ececea` | Primary text, headings, raw data values                         |
| `dim`         | `#8b8a85` | Labels, secondary text, dim metadata                            |
| `primary`     | `#8ab4f8` | Primary action buttons, selected nav, focus ring                |
| `accent`      | `#198754` | Positive status (identical to light — green is theme-stable)    |
| `accent-soft` | `#dff4e9` | Reserved; in dark theme use 12% `accent` over `surface` instead |
| `warn`        | `#b78107` | Warning status                                                  |
| `warn-soft`   | `#fbf0d9` | Reserved; in dark theme use 12% `warn` over `surface` instead   |
| `danger`      | `#c2362f` | Failed validation                                               |
| `danger-soft` | `#fbe4e2` | Reserved; in dark theme use 12% `danger` over `surface` instead |

Outermost frame background in dark is `#0c0d0c`. This is the page-frame
canvas and may be applied as `--color-page` or by mapping `surface-alt` to
`#0c0d0c` and introducing an intermediate well shade. The reference HTML uses
`#0c0d0c` for the canvas and `#171918` for inset wells; implementations are
free to use either as `surface-alt` so long as a consistent two-shade page-
vs-cell separation is preserved.

**Soft tints in dark theme.** The light theme soft tints (`accent-soft`,
`warn-soft`, `danger-soft`) are too bright for dark surfaces. Implementations
MUST replace them with 12% alpha overlays of the corresponding solid color
(`color-mix(in srgb, var(--color-accent) 12%, transparent)` or equivalent).
The token names remain the same so that consumer cells do not branch on
theme.

### 3.3 Theme switching

- The toggle is a single icon button in the top-right of the page chrome.
- Selection persists across reloads. Implementations MUST use a localStorage
  key (`playground.theme`) and respect `prefers-color-scheme` only as the
  initial default before any user choice has been recorded.
- The toggle is always visible; it never hides on mobile.
- Theme transitions are instant (no animation). Animating background-color on
  a full page is jarring and violates "quiet by default."

---

## 4. Type tokens

### 4.1 Families

| Role | Family       | Fallback chain                                                          |
| ---- | ------------ | ----------------------------------------------------------------------- |
| Sans | `Geist`      | `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`            |
| Mono | `Geist Mono` | `IBM Plex Mono`, `JetBrains Mono`, `ui-monospace`, `Menlo`, `monospace` |

- Geist is the primary sans for headings, labels, and prose.
- Geist Mono is the primary mono for all raw data (macaroons, invoices,
  preimages, identifiers, code snippets, JSON, signatures).
- `IBM Plex Mono` and `JetBrains Mono` are accepted fallbacks if Geist Mono is
  unavailable; they were called out in the reference HTML and tested for
  acceptable rendering of long hex strings.
- `Inter` is the documented sans fallback because the reference HTML mocks were
  rendered with Inter as a Geist fallback. Production should always serve Geist
  via `next/font` to avoid the swap.

### 4.2 Size scale

The exact size scale is fixed; do not introduce intermediate sizes.

| Token         | Size (px) | Role                                                |
| ------------- | --------- | --------------------------------------------------- |
| `--size-10`   | 10        | Micro labels (rare, only inside chips)              |
| `--size-11`   | 11        | Sub-label, footnote, status-pill caption            |
| `--size-12`   | 12        | Body label, table column header                     |
| `--size-12-5` | 12.5      | Inline metadata adjacent to mono code (alignment)   |
| `--size-13`   | 13        | Default body sans                                   |
| `--size-13-5` | 13.5      | Mono raw values (matches body height when rendered) |
| `--size-14`   | 14        | Cell header title, primary button label             |
| `--size-15`   | 15        | Larger body, panel intro prose                      |
| `--size-16`   | 16        | Section heading inside a Cell                       |
| `--size-20`   | 20        | Subsection heading                                  |
| `--size-28`   | 28        | Page title                                          |
| `--size-36`   | 36        | Hero numeric / large mono in stripe inspector       |
| `--size-44`   | 44        | Reserved; demo/Hero only                            |

### 4.3 Weights and tracking

- Default body and mono weight: `400`.
- Cell headers, button labels: `500`.
- Page titles and section headings: `600`.
- Hero numerics and stripe-inspector hex: `700`.
- Letter spacing in the reference HTML uses negative tracking on large display
  sizes (`-0.56px` at 20, `-0.9px` at 28, `-1.1px` at 36). Apply negatively-
  tracked headings only at `--size-20` and larger. Body, label, and mono are
  rendered at default tracking.
- Mono is never letter-spaced. Hex and base64 are read character-by-character;
  altering glyph rhythm hurts scanning.

---

## 5. Cells primitive

A **Cell** is the only top-level container in the workbench. It is rectangular,
borderless except for a 1px `border` rule, and composed of fixed parts:

```
┌───────────────────────────────────────────────────────┐
│ HEADER  title · subtitle · view-mode · status-pill    │  cell-header
├───────────────────────────────────────────────────────┤
│                                                       │
│   BODY                                                │  cell-body
│   ...                                                 │
│                                                       │
├───────────────────────────────────────────────────────┤
│ CODE STRIP  // optional, when view-mode = code        │  cell-code
└───────────────────────────────────────────────────────┘
```

### 5.1 Header row

- Left: panel title in Geist sans, `--size-14`, weight `500`. Optional sub-
  title in `dim` color, `--size-12`.
- Right: view-mode toggle (§7), then optional status pill (§8.1).
- Header has a 1px `border` bottom rule. No shadow, no gradient, no fill.
- Header height: 40px ±0.5px depending on rendered glyph metrics.

### 5.2 Body

- Padded `16px` horizontally, `12px` vertically.
- Background is `surface`. The header strip is NOT a separate fill; it shares
  the Cell's `surface` background.
- Long values (>~64 chars) flow through the big-blob primitive (§9).

### 5.3 Code strip

- Visible only when the Cell's view mode is `code` (§7).
- Background is `surface-alt`.
- Top border: 1px `border`.
- Inner padding: `12px 16px`.
- Mono `--size-13-5`, weight `400`, no syntax highlighting beyond the host
  syntax-highlighter's default monochrome scheme (the original
  `SyntaxHighlighter` UX is preserved; the workbench does not introduce its
  own highlighter).

### 5.4 No shadows, except focus and hover rings

- Cells never have a `box-shadow`.
- The only `box-shadow` use in the workbench is the focus ring (§5.5) and an
  optional hover ring on the Cell border (a 1px `primary` color shift on
  `border-color`, not a shadow).

### 5.5 Focus style

A single focus style is used on every interactive surface (button, input,
toggle, link, view-mode tab, copy button, theme toggle, share-URL action):

- `outline: 2px solid var(--color-primary)`
- `outline-offset: 2px`
- `border-radius` matches the surface (0 on Cells; 4px on buttons; 999px on
  pills).

Implementations MUST NOT introduce per-component focus variations. If a
component cannot accept this focus style, that component is wrong.

---

## 6. Macaroon stripe primitive

A horizontal stripe visualization of a macaroon's four logical segments. The
stripe is used inside `ParseToken` (as a view-mode option) and inside
`ValidateL402` (as the segment selector for the per-segment Tamper action).

### 6.1 Segments

Four contiguous segments in this order, left to right:

| Segment ID       | Role                                  | Light fill | Dark fill |
| ---------------- | ------------------------------------- | ---------- | --------- |
| `seg-identifier` | macaroon identifier bytes             | `#1d6fb8`  | `#8ab4f8` |
| `seg-location`   | macaroon location string              | `#198754`  | `#198754` |
| `seg-caveat`     | concatenated caveats (variable count) | `#8a3aa8`  | `#8a3aa8` |
| `seg-signature`  | terminating HMAC signature            | `#b78107`  | `#b78107` |

The four segment fills are normative. They map to `primary`, `accent`, the
purple accent `#8a3aa8`, and `warn` respectively in the reference HTML.

### 6.2 Width allocation

- The stripe occupies the full Cell-body width.
- Segments are weighted by their byte length, not equal width. Identifier and
  signature segments are typically narrow; caveat segments expand. The stripe
  scales linearly: 1 byte → 1 unit, then the strip is normalized to 100%.
- Each segment shows its byte count below it, in `--size-11` `dim`.

### 6.3 Tamper action (ValidateL402)

In `ValidateL402`, each segment is clickable. Clicking a segment opens a per-
segment Tamper action that flips one byte and re-runs validation. Tampered
segments render with the `danger` color overlaying the segment fill at 60%
alpha, plus a `danger` 2px top border.

### 6.4 No animations on the stripe

The stripe does not animate on mount or on theme change. It snaps. Validation
state changes (tamper applied / reverted) MAY use a 120ms color crossfade on
the affected segment only — no width or position animation.

---

## 7. View modes

Every Cell that displays a structured value exposes a view-mode toggle:

| Mode   | Definition                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raw`  | The byte-faithful rendering of the value. **Source of truth.** For a macaroon, this is the base64 token. For an invoice, this is the bolt11 string.             |
| `json` | A parsed/structured rendering. For a macaroon, the decoded fields. For an invoice, the parsed tagged fields. May reorder for readability; MUST NOT drop fields. |
| `code` | The code-snippet pane: a runnable code example that produces this exact value with `@boltwall/l402`. The Cell's "Code strip" (§5.3) opens beneath the body.     |

### 7.1 Rules

- `raw` is the default mode on first render.
- `raw` is the source of truth. If `json` and `raw` disagree, `raw` is correct
  and `json` is the bug.
- The toggle is a segmented control in the Cell header, right of the title.
  Each segment is `--size-12`, weight `500`, with the active segment using
  `text` color over `surface-alt` fill and the inactive segments using `dim`
  color over `surface`.
- The currently selected mode is part of the Cell's URL state (§10).
- Not every Cell supports all three modes. A Cell without a code example
  omits the `code` segment from the toggle entirely; it does not render a
  disabled segment.

---

## 8. Pills and chips

Three small horizontal element families. They share the same outer geometry
(`border-radius: 999px`, `padding: 2px 8px`, `--size-11`, weight `500`, no
border) but differ in fill rules and copy semantics.

### 8.1 Status pill

Reports the runtime state of a Cell or operation.

| State     | Light fill    | Dark fill                            | Text color |
| --------- | ------------- | ------------------------------------ | ---------- |
| `ok`      | `accent-soft` | `color-mix(accent 12%, transparent)` | `accent`   |
| `pending` | `surface-alt` | `surface-alt`                        | `dim`      |
| `warn`    | `warn-soft`   | `color-mix(warn 12%, transparent)`   | `warn`     |
| `error`   | `danger-soft` | `color-mix(danger 12%, transparent)` | `danger`   |

The status pill lives in the Cell header, right of the view-mode toggle.

### 8.2 Caveat pill

Describes a single caveat parsed from a macaroon. Always in the body, not in
the header.

- Renders the caveat's parsed condition as `key=value` in Geist Mono,
  `--size-12`.
- Background: `accent-soft` if a satisfier matched, `surface-alt` if no
  satisfier has been registered, `danger-soft` if a satisfier rejected.
- Caveat-pills wrap in the row; long values use trunc.middle (§9) inside the
  pill.

### 8.3 Chip

Generic neutral tag used for protocol fields (e.g., `L402`, `LSAT`, scheme,
network). Always neutral fill (`surface-alt`), `dim` text, no border.

---

## 9. Big-blob handling

Three primitives that govern the rendering of long values (anything wider than
~64 columns at the Cell's mono size). They compose; a single value may use all
three.

### 9.1 `big-blob.copy`

A copy-to-clipboard button anchored to the value. Default location: top-right
of the value's container, absolutely positioned at `top: 8px; right: 8px`.

- Icon-only by default; reveals a "copied" label for 1.2s after success.
- Always present on raw mono values longer than ~32 characters.
- Keyboard shortcut: focusable button, activated by `Enter` or `Space`.

### 9.2 `big-blob.toggle`

A show/hide control for very long values (>~512 chars). When collapsed:

- Shows the first 40 chars, a `…` ellipsis, and the last 8 chars.
- A `[show full]` text button in `dim` color reveals the full value.
- Expanding does not animate; it snaps.

### 9.3 `big-blob.wrap`

The default flow mode: the value wraps inside its container with
`overflow-wrap: anywhere` and `word-break: break-all`. Hex and base64 wrap
character-by-character so that the rendered shape mirrors the byte stream.
This is the production-safe default — no horizontal scroll, no ellipsis.

### 9.4 `trunc.middle`

For fixed-width identifiers (32-byte hashes, public keys, payment-hashes)
where wrapping would obscure structure:

- Renders as `<first-6>…<last-6>`.
- Hover-tooltip and focus-tooltip both reveal the full value, monospace, in a
  positioned tooltip layer.
- The tooltip is also a click-to-copy target.
- `trunc.middle` is used inside compact rows (e.g., the Caveats list,
  identifier column in a table) where vertical real estate is constrained.

---

## 10. URL state sharing (nuqs)

Every Cell exposes its full state in the page URL via [`nuqs`](https://nuqs.47ng.com/).
The URL is the share-receipt.

### 10.1 Affordance

- Every Cell has a "copy URL to share state" button next to the view-mode
  toggle. The button copies the current URL (with the Cell's full state) to
  the clipboard.
- Behavior is identical to `big-blob.copy`: 1.2s "copied" feedback, no toast.
- Tooltip: `Copy share-state URL`.

### 10.2 Query parameter shape

- Each Cell namespaces its parameters under its panel slug:
  `?signingKey.bytes=...&parse.input=...&parse.view=json`.
- Parameter values are URL-encoded UTF-8 strings. Mono raw values
  (base64 macaroons, bolt11 invoices) are encoded as-is. JSON view state is
  not stored separately — view mode is enough; the raw input regenerates JSON.
- View mode is its own parameter (`<panel>.view = raw|json|code`).
- Theme is NOT in the URL. Theme is per-user persistence (§3.3); sharing a
  URL respects the recipient's theme preference.

### 10.3 Round-trip guarantee

Pasting a copied URL into a fresh browser tab MUST reproduce the exact Cell
state, byte-for-byte, including the view mode. This is the acceptance test
for every Cell's URL state binding.

### 10.4 Sensitive data

Root keys and preimages are bearer credentials. The "copy URL" affordance is
present on Cells that include them, but the button label MUST display a
warning tooltip (`This URL contains bearer credentials`) and the copy must
NOT also auto-share to any clipboard-sync service. The workbench is local;
this is a user-education affordance, not a protocol surface.

---

## 11. Panel-to-spec mapping (informative)

The workbench is organized as 9 panels. Each panel is a Cell composition. Two
panels fold-in reference features from the design HTML that were originally
separate views:

- **ParseToken** absorbs the standalone `Inspect` view as its `json` view mode
  and absorbs the stripe view from `validate.html` as a fourth view-mode (this
  is the one Cell where four view modes are allowed: `raw | json | stripe |
code`). The `stripe` mode renders the §6 macaroon stripe.
- **ValidateL402** absorbs the standalone `Mutate` view as a per-segment
  Tamper action, accessed by clicking a segment in the stripe (§6.3).

The validate.html reference mock's top navigation lists the original ten
items (`Home / From invoice / From challenge / Parse token / Validate /
Satisfy / Caveats / Expiration / Inspect / Mutate` plus right-side `docs /
spec / github`). The workbench navigation removes `Inspect` and `Mutate` from
top-level. Right-side links `docs / spec / github` are retained.

---

## 12. What this spec does NOT cover

To keep the spec narrow and the implementation tasks focused:

- **No Tailwind config.** Token names are defined here. Whether the
  implementation uses Tailwind's `theme.extend.colors`, CSS custom properties,
  or both belongs with the application styling implementation.
- **No `globals.css` content.** Reset, font loading, and base styles live in
  the app stylesheet.
- **No component prop interfaces.** TypeScript shapes for `<Cell>`,
  `<StatusPill>`, `<MacaroonStripe>`, etc., live with the implementation tasks.
- **No package additions.** `nuqs` is named here as a requirement; adding it
  to `apps/playground/package.json` belongs with the implementation task.
- **No copy text.** Cell titles, button labels, tooltips, and error messages
  are owner-provided when each panel ships.

---

## 13. References

- `apps/playground/design/reference/tokens.html` — owner-supplied tokens and
  primitives mock. Visual source of the values in §3, §4, §6.
- `apps/playground/design/reference/validate.html` — owner-supplied Validate
  screen mock. Visual source of the navigation order in §11 and the stripe
  Tamper action in §6.3.
- `docs/playground-visual-concepts.md` — previous direction (Concept D /
  Color Grid). Superseded.
- Tracking reference: playground Cells + Macaroon-stripe design direction.

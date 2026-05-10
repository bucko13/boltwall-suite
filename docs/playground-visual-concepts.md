# Playground Visual Concepts

Bead: `bw-0dw.10`

The owner selected Concept D, **Color Grid**, as the direction to carry forward.

The playground first screen at `apps/playground/app/page.tsx` now preserves that
single selected concept as the build reference, with light and dark previews and
full-length sample macaroon, invoice, and preimage values.

## Selected Theme: Color Grid

- **Posture:** developer-tool clarity with enough product energy to feel distinct.
- **Structure:** flat grid, squared panels, hard section boundaries, no soft card
  stack, and no gradient-driven visual identity.
- **Primary color:** teal blue `#0f6d8f` for top bars, selected navigation, and
  primary actions.
- **Dark-mode accent:** brighter aqua `#4dd0b8` as the long-data row rail.
- **Secondary accent:** coral `#d94b36` for the selected badge, protocol warning
  text, and price/value emphasis.
- **Outer rule:** deep blue-green `#0f2f3c`.
- **Light surface:** off-white page grid with white preview panels and white
  long-data rows.
- **Dark surface:** ink background `#101820`, raised dark panels `#152534`, and
  dark token rows `#101b26`.
- **Typography:** large plain sans headings, compact monospace labels and token
  values, no negative letter spacing.
- **Credential data pattern:** full macaroons, invoices, and preimages wrap inside
  token rows with a compact copy affordance; the UI should not depend on
  horizontal scrolling or ellipsis for primary credential review.
- **Responsive behavior:** light and dark previews sit side by side on desktop
  and stack on narrow screens with the same token wrapping behavior.

## Build Notes

- Carry the selected `theme-colorgrid`, `layout-colorgrid`, and
  `mockup-colorgrid` ideas into the real playground implementation rather than
  reintroducing the rejected exploration concepts.
- Keep the list/token rows flat. The owner specifically rejected tinted list-item
  fills for this direction; use color rails and borders for emphasis instead.
- Preserve both light and dark treatments when applying the final system.

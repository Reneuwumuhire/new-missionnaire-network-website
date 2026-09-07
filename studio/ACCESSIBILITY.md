# Studio readability audit

Audited 7 September 2026 across Light, Dark, and Midnight.

## Changes

- Replaced faint foreground and hard-coded status text with solid theme-specific muted, success, warning, danger, and accent colors throughout Studio’s interface.
- Raised interface text below 12 px to 12 px. Form inputs remain 14 px; headings retain their hierarchy. Broadcast canvas content and user-specified lyric typography are unchanged.
- Strengthened input and chip boundaries, slider tracks and handles, and keyboard focus. Retained native select keyboard behavior.
- Corrected selected scene numbers on orange and white text on red action/status backgrounds.

## Verification

The reference thresholds are [WCAG 2.2](https://www.w3.org/TR/WCAG22/): 4.5:1 for normal text and 3:1 for control boundaries and focus indicators.

Palette regression tests cover every theme’s four main surfaces, status tints at 20% opacity, retained foreground alpha values, control boundaries, focus, and solid badge colors. Source checks reject interface text below 12 px and the old dark-only status text classes.

Computed browser text measurements at 1280 × 720 covered seven Settings sections, the workspace, and live service setup in each theme (27 views). No measured enabled text failed 4.5:1 after fixes. The lowest observed ratio was 4.83:1 on the red AIR badge. Workspace layouts were inspected visually in Light and Midnight; scrolling remains available in dense panels and settings.

## Scope

These are readability checks, not a full accessibility certification. Browser measurements covered visible, opaque interface text and excluded disabled controls, hidden content, and media. Native picker menus, all device-dependent states, screen-reader operation, text zoom, and user-provided video/lyrics were not exhaustively tested. Recheck those separately when changing their behavior.

Run the regression checks with `pnpm test` from `studio`.

# UI 2.0 design system and view precedence

Date: 2026-10-01

## Decision

Claude Design delivered a new design source (commit `4fdc67a`) that replaces the
three "Vision Studio" files. The user approved a gradual migration plan:
`.titan/plans/prp-ui-2-0-design-migration.md`.

Precedence for every existing and future view (user, 2026-10-01: "la guía manda
para todo"):

1. `docs/design/Guía UI LensSpace.dc.html` governs everything: tokens, type scale,
   radii, elevations, buttons, fields, badges, page header, navigation, lists,
   alerts, dialogs and the adoption plan. If any other source disagrees, the guide wins.
2. `docs/design/Pedidos y cobros v2.dc.html` is the concrete application of the guide
   for that screen and the reference composition for list + detail workspaces.
3. Existing app patterns only where the guide is silent, adapted to the guide.
4. Usability, accessibility (WCAG AA), responsive behaviour and server-side
   authorization must be preserved when adapting a mockup.

`docs/design/Pedidos y cobros LensSpace.html` is the same v2 bundled for offline
viewing; it is kept but is not the editable source. `support.js` is Design Canvas
tooling and never ships.

## Key rules from the guide

- Tokens: ink `#07322F`, ink-2 `#10463F`, action `#0D7A72`, mint `#35C2A8`, coral
  `#FF6B4A`, amber `#A35A15`, text `#1C3A37`, muted `#5F716C` (replaces `#74857F`),
  line `#DCECEA`, canvas `#F7FBFA`. Nav section labels `#7FB3AC`.
- Ink frames, action (teal) acts, coral only for attention (balance, incidents);
  text on coral is ink, never white.
- Radii 6 badge / 10 control / 14 card / 20 panel; shadows e1–e3; controls 44 px.
- Five badge tones: neutral, progress, success, warning, danger. Business status to
  tone mapping lives in each feature, never in `src/shared/ui`.
- lucide-react icons in navigation, buttons, alerts and empty states.

## User decisions over the guide

- 2026-10-01: every page header uses the featured ink `PageHeader` (with or without
  stat cards); the guide's white "simple" header is not used.
- 2026-11-09: on phones (below `md`) the featured header shows only title and actions; the
  stat cards, eyebrow and description open with a «Resumen» button, closed by default.
  Pages without stats have no button. Desktop is unchanged.

## Constraints

- ~~`tailwind.config.ts` remaps `slate/sky/emerald/red`…~~ Superseded 2026-10-02 (Fase 9):
  legacy remaps, `rounded-lg/xl` overrides and `--vs-*` are gone. Every colour is a
  semantic token in `tailwind.config.ts` (`text-secondary/label/placeholder`,
  `line-soft/card/strong/hover/focus`, `action-tint`, `success-*`, `coral-tint/line/wash`,
  `on-ink-*` for text on the ink surface…). Shadow rings use `theme(colors.x)`.
  ESLint `no-restricted-syntax` rejects hex in `src/features/**` (landing excluded, D3).
  New colour → add a token first, never an inline hex.
- Visual validation is manual by the user (no Playwright screenshots); each phase
  ends with a concrete review checklist.
- `docs/design/brand/` was synced to the D2.1 logo on 2026-10-01.

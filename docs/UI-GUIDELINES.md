# UI guidelines

Short rules that keep every screen aligned and dense. Fix problems in the shared
component, not in the page.

## Control height

Every control that sits on a form or toolbar is **40px** (`h-10`), text-sm on
desktop (text-base on mobile so iOS does not zoom), 10px radius, 1px
`zinc-950/10` border:

Input, Textarea (minimum), Select/Listbox, Combobox, Date/Time/Month pickers,
Button (md), the segmented control (`dashboard-range-bar`), search fields,
FilterSelect, StatusFilter, DateRangeFilter, RangeSlider.

Do not add `py-*` overrides to a control. If a new control needs a different
height, it is wrong. Buttons have `size="sm"` (32px) for use inside table rows
and cards only.

## Spacing scale

| Where | Value |
| --- | --- |
| Field to field (`FieldGroup`) | 20px (`space-y-5`) |
| Row grid | `gap-x-4 gap-y-5` (16px / 20px) |
| Label to control | 6px |
| Control to help or error text | 4px, `text-xs/5` |
| Section to section (form, page) | 24px (`gap-6`) plus a `Divider` |
| Section heading (`Legend`) | `text-sm` semibold with a hairline under it |
| Card padding | `p-4` or `p-5` |
| Table cell | `py-2.5`, header `py-2.5` `text-xs` |

Help text goes under the control and never changes where the next column
starts: put the fields of a row in one grid so rows share top edges.

## Form grid

- Forms are `max-w-5xl` (`max-w-6xl` when the form holds a line editor).
  Settings-like pages are `max-w-3xl` or `max-w-4xl`. Lists and the dashboard use
  the full content width. Everything is left aligned under the page heading.
- Long forms use a 12 column grid from `sm`: `grid grid-cols-1 gap-x-4 gap-y-5
  sm:grid-cols-12` with spans that add up to 12 and use the same edges in every
  row (6 / 3 / 3, or 4 / 4 / 4, or 6 / 6). One column on mobile.
- The Save / Cancel bar is `<div className="form-actions">`. It sticks to the
  bottom of the viewport (above the tab bar on mobile) and is hidden when
  printing.

## Toolbars

One pattern: `flex flex-wrap items-center gap-3`, every item 40px. Page headers
use `flex flex-wrap items-start justify-between gap-x-4 gap-y-3` so the title
block and the action buttons share a top edge. In the dashboard header the
actions are centred against the greeting.

A hidden input inside a `Field` must come after the control. `Field` spaces the
control with an adjacent-sibling selector (`label + control`), so anything in
between removes the gap.

## Surfaces and elevation

Three layers, no more: the canvas (`--canvas`, #f6f7f9 / #0b0f17), cards on the
canvas, and inset panels inside cards. Everything is defined once in
`src/app/globals.css`; do not hand-roll `ring-1 ring-zinc-950/5` boxes.

| Class | Use it for |
| --- | --- |
| `surface-card` | Anything that holds content on its own: stat cards, dashboard panels, summary boxes, settings sections, list/table containers, empty states. White, `rounded-xl`, `--shadow-card` (hairline plus soft ambient). Add `p-4` (dense) or `p-5`. |
| `surface-card-interactive` | A card that is a link or button. Adds a stronger shadow on hover, a 1px lift (only when motion is allowed) and a focus ring. |
| `surface-inset` | A quiet panel nested inside a card or form: a copyable link, a helper block, an inline-action panel. A touch darker than its parent, no shadow, `rounded-lg`. |
| `surface-tinted-warn/good/bad` | A callout whose message is the point (payment overdue, no dues). Soft tint with a matching hairline. |
| `StatCard` (`@/components/stat-card`) | One figure: muted label, big tabular value, optional hint, delta and 36px icon tile. Tone (`neutral`, `good`, `warn`, `bad`) colours only the icon tile and the value. Pass `href` to make the whole card a link. Cards in a grid share a height. |

Rules:

- Dark mode lifts surfaces from #0b0f17 to #141a26 with a 1px white/8 ring. No
  drop shadows in dark.
- One shadow level for resting cards (`--shadow-card`); `--shadow-pop` is only
  for popovers, menus and dialogs. Never put a shadowed card inside a card.
- Cards are `rounded-xl`, inner panels `rounded-lg`. Padding is `p-4` or `p-5`.
- Tint the content, not the card: a bad figure gets a red value or icon tile, not
  a red card. Use `surface-tinted-*` only for banners.
- Forms stay flat on the canvas. Box a form only when it is a settings section.
- Print is flat: the utilities drop the shadow and keep a hairline outline, so
  invoices and quotations stay black on white.

## Do and do not

- Do build a card with `surface-card`; do not combine `bg-zinc-50` with `ring-1`
  on a rounded box, and do not add `shadow-*` utilities to cards.

- Do use `Field`, `Label`, `Description`, `ErrorMessage` for every form control.
- Do use `Description` only inside a `Field` (Headless UI throws otherwise); use a
  plain `<p className="text-xs/5 text-zinc-500">` elsewhere.
- Do right align money and quantities and give them `tabular-nums`.
- Do keep icons `size-4` next to `text-sm` text with `gap-2`.
- Do not hard code `mt-*` between a label and its control.
- Do not centre a page container with `mx-auto`; use the width classes above.
- Do not change print styles: invoices and quotations print black on white.

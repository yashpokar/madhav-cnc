# Prodlys logo files

Hand-authored SVGs. The mark geometry matches `src/lib/brand.ts` and `src/components/brand-mark.tsx`.

| File | Use |
| --- | --- |
| `mark-*.svg` | The "p" tile alone. Avatars, favicons, tight spaces. |
| `wordmark-*.svg` | The lowercase `prodlys` text alone. |
| `lockup-*.svg` | Mark and wordmark side by side. The default logo. |

Each comes in three colourways:

- `full`: indigo tile (`#4f46e5`) with a white "p"; ink (`#0b0f17`) wordmark. Use on white or light grey.
- `mono-dark`: one colour (`#0b0f17`), the "p" cut out of the tile. Use for single-colour print, stamps and fax-style output.
- `mono-light`: one colour (white), the "p" cut out. Use on indigo, photos and dark backgrounds.

## Clear space

Keep a margin around the logo equal to the width of the "p" stem's bowl, which is one quarter of the tile width (8 units on the 32 unit mark). For the lockup that is a quarter of the mark's height on every side. Nothing else sits inside it: no text, edges or other logos.

## Minimum sizes

| Logo | Minimum |
| --- | --- |
| Mark | 16 px (on screen), 6 mm (print) |
| Lockup | 80 px wide (on screen), 25 mm (print) |
| Wordmark alone | 56 px wide (on screen), 18 mm (print) |

Below 24 px, use the mark on its own.

## Font note

The wordmark is live text set in Inter SemiBold (falling back to Helvetica Neue, Arial, then the system font), so it renders correctly in browsers but can shift on machines without Inter. Before sending a file to a printer or embedding it where fonts are unavailable, open it in a vector editor and convert the text to outlines.

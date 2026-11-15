# Prodlys brand guide

Prodlys runs a whole business in one place: quotes, orders, production, billing and payments. It is built for workshops, studios, salons, caterers, hotels and more, so the brand stays industry-neutral.

## Name

- In sentences: **Prodlys**, capitalised. "Sign in to Prodlys."
- In the logo: the lowercase wordmark `prodlys`. Never type the wordmark's lowercase form in running text.
- Never "ProdLys", "PRODLYS" or "Prodly".
- Domains: `app.prodlys.com` is the product, `prodlys.com` is the future marketing site.

## Tagline

> Run your whole business in one place

Use it as shown, sentence case, no full stop in titles. Supporting line: "Quotes, orders, production and billing."

## Colour

Tokens live in `src/app/globals.css`. The accent can be re-themed per company; the brand colours below are Prodlys' own.

| Token | Hex | Contrast | Use |
| --- | --- | --- | --- |
| Accent 600 | `#4f46e5` | 6.3:1 on white, 5.9:1 on canvas | Logo tile, primary buttons, links |
| Accent 800 | `#3730a3` | 9.9:1 on white | Gradient end, pressed states |
| Accent 200 | `#c7d2fe` | 6.7:1 on Accent 800 | Secondary text on the gradient |
| Accent 50 | `#eef2ff` | decorative | Tints and selected rows |
| Ink (zinc 950) | `#0b0f17` | 17.9:1 on canvas | Body text, wordmark |
| Secondary text (zinc 500) | `#5b667a` | 5.8:1 on white | Hints, dates, captions |
| Canvas | `#f6f7f9` | n/a | App background |

White text on Accent 600 passes AA at every size (6.3:1). Do not use Accent 500 (`#6366f1`, 4.5:1) for small text.

## Typography

Inter, one family throughout. Semibold (600) with tight tracking for headings and the wordmark; regular (400) for body. Use tabular figures for amounts. Sentence case everywhere, including buttons and headings.

## Logo usage

Do:

- Use the lockup by default, the mark alone when space is tight.
- Use the colourway that matches the background (see `public/brand/README.md`).
- Leave the clear space and respect minimum sizes.

Don't:

- Recolour the tile outside the brand indigo, add gradients, shadows or outlines.
- Stretch, rotate or re-space the wordmark.
- Set the wordmark in another typeface or in capitals.
- Place the full-colour logo on indigo or busy photos; use `mono-light`.
- Put the logo on customer-facing documents. Those carry the company's own identity; Prodlys appears only as the small screen-only "Powered by Prodlys" footer on shared links.

## Tone of voice

Plain, confident, helpful. Say what happens, in words the person already uses. One product serves many industries, so avoid vocabulary from one trade.

| Instead of | Write |
| --- | --- |
| "Submit" | "Save quote" |
| "Oops! Something went wrong" | "Could not save the invoice. Check your connection and try again." |
| "No data available" | "No orders yet. Create an order from an accepted quote." |
| "Furniture job card" (in shared UI) | "Order" |
| "Leverage our powerful workflows" | "Turn a quote into an order in one click." |
| "Invalid input" | "Enter a phone number with 10 digits." |

Errors state what failed and how to fix it, without apologising. Empty states point to the next action. An action keeps one name through its whole flow: "Send" produces "Sent".

## File inventory

| Path | What |
| --- | --- |
| `public/brand/` | Logo SVGs: mark, wordmark, lockup in full, mono-dark, mono-light, plus usage README |
| `src/lib/brand.ts` | Name, tagline, colours, mark geometry |
| `src/components/brand-mark.tsx` | In-app mark, wordmark and lockup components |
| `src/components/powered-by.tsx` | Screen-only footer for public share pages |
| `src/app/icon.svg` | Favicon (SVG) |
| `src/app/icon1.tsx`, `icon2.tsx` | 32 px and 16 px PNG favicons |
| `src/app/favicon.ico/route.ts` | `/favicon.ico` (PNG-in-ICO, 16 and 32 px) |
| `src/app/apple-icon.tsx` | 180 px Apple touch icon |
| `src/app/pwa-icon/[size]/route.tsx` | PWA icons (192, 512, maskable) |
| `src/app/opengraph-image.tsx`, `twitter-image.tsx` | 1200x630 Prodlys link preview |
| `src/app/{q,t,i}/[token]/opengraph-image.tsx`, `twitter-image.tsx` | Neutral link preview for shared documents (no Prodlys branding, no amounts) |
| `src/lib/brand-image.tsx` | Shared `next/og` renderers for all of the above |
| `src/lib/share-metadata.ts` | Title and description for shared document pages |

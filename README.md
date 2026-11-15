# Prodlys

**Run your whole business in one place.** Prodlys covers quotes, orders, production, billing and payments for workshops, studios, salons, caterers, hotels and more. Each company keeps its own name, branding details and industry setup.

Where it runs:

- `app.prodlys.com`: the product (sign in, staff app, customer share links)
- `prodlys.com`: the future marketing site (not part of this repo)
- `localhost:3000`: local development

Brand assets and voice: see [`docs/BRAND.md`](docs/BRAND.md) and `public/brand/`.

## What it covers

| Area | What you do there |
| --- | --- |
| **Sell** | Quotations (shareable with customers at `/q/<token>`), orders, production board, dispatch, order statement |
| **Money** | Invoices, payments and receipts, expenses, reports and CSV exports |
| **People** | Customers, vendors, architects and carpenters |
| **Catalogue** | Items and materials |
| **Administration** | Users and roles, multiple companies, activity log, company details, payment modes (with QR codes) |

Customers can follow an order without signing in through its tracking link (`/t/<token>`).

## Stack

Next.js (App Router) · React 19 · Tailwind CSS 4 with Catalyst components · Prisma 7 on PostgreSQL · Better Auth (email and Google) · S3-compatible storage for uploads · deployed on Railway.

> This Next.js version has breaking changes. Read the guides in `node_modules/next/dist/docs/` before changing framework-level code.

## Running locally

```bash
pnpm install
cp .env.example .env          # then fill in the secrets
docker compose up -d          # Postgres on localhost:5433
pnpm prisma migrate deploy    # apply migrations
pnpm db:seed                  # optional: starter data
pnpm dev                      # http://localhost:3000
```

Useful scripts: `pnpm typecheck`, `pnpm lint`, `pnpm db:migrate` (create a migration), `pnpm db:studio`.

## Configuration

See `.env.example`. The essentials are `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; Google sign-in and file uploads need the `GOOGLE_*` and `S3_*`/`AWS_*` values. Set `PUBLIC_BASE_URL` so shared links point at the right host.

## Project layout

- `src/app/(app)` – signed-in screens, one folder per area
- `src/app/q`, `src/app/t`, `src/app/i` – public quotation, order-tracking and invoice pages
- `src/components` – shared UI (`catalyst/` holds the base kit)
- `src/lib` – permissions, navigation, pricing, queries, server actions
- `prisma/` – schema, migrations, seed
- `src/lib/features.ts` – switches for built-but-hidden features (e.g. credit/debit notes)

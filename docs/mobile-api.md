# Mobile API (v1)

Everything for the native apps lives under `/api/v1`. The committed spec is
`openapi/prodlys-v1.json` (served at `/api/v1/openapi.json`); regenerate it with
`pnpm openapi:generate` after changing a route's schema (a test fails when it is stale).

## Auth

- Sign in with `POST /api/auth/sign-in/email`; the session token comes back in the
  `set-auth-token` response header. Send it as `Authorization: Bearer <token>`.
- Sessions last 30 days (refreshed daily).
- The server runs the `@better-auth/expo` plugin (`expo()` in `src/lib/auth.ts`, before `nextCookies()`;
  `bearer()` stays). `prodlys://` and `prodlys://*` are trusted origins. Pinned to the same 1.7.x as `better-auth`.
- Mobile sign-in with the Expo client (`expoClient({ scheme: 'prodlys', storagePrefix: 'prodlys' })`) sends an
  `expo-origin` header (`prodlys://`) on every call and keeps the session in SecureStore.

### Google sign-in on mobile

- Use `authClient.signIn.social({ provider: 'google', callbackURL: '/' })` from the Expo client. It opens the system
  browser at `/api/auth/sign-in/social`, and after Google the server redirects to the app through
  `prodlys://` carrying a one-time cookie the client turns into the session. The `expo-origin` header
  is what lets Better Auth accept the `prodlys://` callback.
- Google Cloud Console: keep ONE OAuth *web* client (the server's `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`)
  with the **authorised redirect URI** `https://app.prodlys.com/api/auth/callback/google`
  (and `http://localhost:3000/api/auth/callback/google` for dev). The app never talks to Google directly,
  so no native client or custom-scheme redirect is registered with Google.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` must be set on the server or the Google provider is not enabled.

## Read endpoints (M1/M2)

All need `Authorization: Bearer` and `X-Company-Id` (except `/states`). Lists take `?limit=` (default 25, max 100)
and `?cursor=`, and answer `{ data: [...], meta: { nextCursor, hasMore } }`; a record answers `{ data }` with an
`ETag` (send `If-None-Match` to get a bodiless `304`). Money is a decimal string (`"12345.50"`), calendar days are
`YYYY-MM-DD`, instants are ISO 8601, ids are cuids, enums are the database names. Every resource has `updatedAt`
(receipts have no edit stamp, so theirs is the recorded time). A record of another company is `404`; a missing
capability is `403 FORBIDDEN`.

| Path | Capability |
| --- | --- |
| `GET /dashboard/summary` | none (each block null without its own: invoice:read, expense:read, order:read, stock:read, purchase:read) |
| `GET /customers`, `/customers/{id}` | customer:read (`account` balance needs invoice:read) |
| `GET /items`, `/items/{id}` | item:read (`purchaseRate` needs purchase:read) |
| `GET /quotations`, `/quotations/{id}` | quotation:read |
| `GET /orders`, `/orders/{id}` | order:read |
| `GET /invoices`, `/invoices/{id}` | invoice:read |
| `GET /payments`, `/payments/{id}` | payment:read |
| `GET /expenses`, `/expenses/{id}` | expense:read |
| `GET /calendar?from=&to=&layers=` | per layer: order:read, dispatch:read, invoice:read, payment:read |
| `GET /production/tasks` | production:read |
| `GET /payment-methods` | payment:read |
| `GET /expense-categories` | expense:read |
| `GET /states` | public, `Cache-Control: public, max-age=86400`, ETag |

Lists are ordered newest first (`createdAt`; payments by `paidOn`; expenses by `expenseDate`; items by name;
production tasks by order due date) with the id as tie-break, so a cursor never repeats or skips a row.

## Tenancy

Company endpoints need `X-Company-Id`. The person must be able to open that
company (super-admins: any existing one), otherwise `403 COMPANY_NOT_ACCESSIBLE`;
a missing header is `400 COMPANY_REQUIRED`. There is never a fallback to "the first company".

## Before the apps ship

- Add `app.prodlys.com` to `ALLOWED_ORIGINS` BEFORE flipping `ALLOW_ALL_ORIGINS` to `false`.
- Env: `PRODLYS_MIN_APP_VERSION_IOS`, `PRODLYS_MIN_APP_VERSION_ANDROID`, `PRODLYS_LATEST_APP_VERSION`.
- The rate limiter is in-memory (one replica). Use a shared store (Redis) before running several replicas.
- `public/.well-known/apple-app-site-association` and `assetlinks.json` are TEMPLATES with placeholder
  team id, bundle id and SHA-256 fingerprint. The owner must fill in real values (and delete the `_TEMPLATE` key).
- `cleanupIdempotencyKeys` (src/lib/api/idempotency.ts) should run from a scheduled job; rows are also
  ignored for replay after 24 hours.

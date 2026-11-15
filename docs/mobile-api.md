# Mobile API (v1)

Everything for the native apps lives under `/api/v1`. The committed spec is
`openapi/prodlys-v1.json` (served at `/api/v1/openapi.json`); regenerate it with
`pnpm openapi:generate` after changing a route's schema (a test fails when it is stale).

## Auth

- Sign in with `POST /api/auth/sign-in/email`; the session token comes back in the
  `set-auth-token` response header. Send it as `Authorization: Bearer <token>`.
- Sessions last 30 days (refreshed daily).
- The mobile repo will use `@better-auth/expo`; the server then also needs the
  `expo()` plugin (not installed yet). `prodlys://` and `prodlys://*` are already trusted origins.

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

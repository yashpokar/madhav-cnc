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

## Write endpoints (M3)

Every write needs `Authorization: Bearer` and `X-Company-Id` (except `POST /devices`, where the company is optional),
and a role whose capability matches; otherwise `403 FORBIDDEN`. A record of another company is `404 NOT_FOUND`.
Each write answers the saved record in the same shape as its `GET` (so a screen can replace its copy), with an
`ETag` header, `201` for a create. All rules are the web's: the endpoints call the same services as the server
actions (same pricing, GST, receipt auto-apply, status tables, activity log).

`PATCH` on a document (quotation, order, invoice, expense) **replaces** it: send the whole document, lines included.
Only `PATCH /customers/{id}` is partial (the fields sent change; `null` clears one). Dates are `YYYY-MM-DD`, money
and quantities are JSON numbers going in (decimal strings coming out).

| Method and path | Capability | Body (example) |
| --- | --- | --- |
| `POST /customers` | customer:create | `{"name":"Ravi Patel","phone":"9876500001","city":"Surat","state":"Gujarat"}` (also email, gstin, address, ...). A phone another customer uses is `409` |
| `PATCH /customers/{id}` | customer:update | `{"city":"Vapi"}` |
| `POST /quotations` | quotation:create | `{"customerId":"...","subject":"Bedroom","discountType":"PERCENT","discountValue":5,"notes":"","validUntil":"2026-12-31","lines":[{"description":"Wardrobe","unit":"SQFT","quantity":40,"rate":1200,"taxRatePercent":18}]}` (draft; `quotationDate` defaults to today) |
| `PATCH /quotations/{id}` | quotation:update | the same document; draft only, else `409` |
| `POST /quotations/{id}/status` | quotation:update | `{"status":"SENT"}` (an illegal move is `409`) |
| `POST /quotations/{id}/share` | quotation:update | none. Returns `{url, token, whatsappText, whatsappLink, created}`; `url` is built on `PUBLIC_BASE_URL` |
| `POST /quotations/{id}/convert` | order:create | none. `201` with the new order (quotation must be ACCEPTED) |
| `POST /orders` | order:create | `{"customerId":"...","orderDate":"2026-11-15","lines":[...],"advanceAmount":0}` |
| `PATCH /orders/{id}` | order:update | the same document. The status never changes here; invoiced/cancelled/dispatched orders are `409` |
| `POST /orders/{id}/status` | order:update | `{"status":"IN_PRODUCTION"}` (creates the stage tasks) |
| `POST /invoices` | invoice:create | `{"orderId":"..."}` alone: a draft from a COMPLETED order; or a whole invoice `{"customerId","invoiceDate","lines":[...],"status":"DRAFT"}` |
| `PATCH /invoices/{id}` | invoice:update | the whole invoice; draft only, else `409` |
| `POST /invoices/{id}/issue` | invoice:update | none. **Plan-limited** (see below) |
| `POST /invoices/{id}/cancel` | invoice:update | none. `409` while payments are applied |
| `POST /invoices/{id}/share` | invoice:update | none. Issued invoices only (`409` for a draft). Same answer as a quotation share |
| `POST /payments` | payment:create | `{"customerId","amount":500,"methodId":"<GET /payment-methods id>","paidOn":"2026-11-15","details":{...},"allocations":[{"invoiceId","amount"}],"openingApplied":0}` |
| `DELETE /payments/{id}` | payment:delete | none. Allocations go with it; an order advance is `409` |
| `POST /expenses` | expense:create | `{"payeeName","expenseDate","amount","taxRatePercent":18,"methodId","details":{},"receiptUploadId":"..."}` |
| `PATCH /expenses/{id}` | expense:update | the whole expense; leaving `receiptUploadId` out keeps the receipt, `null` removes it |
| `DELETE /expenses/{id}` | expense:delete | none |
| `POST /production/tasks/{id}/start` | production:update | `{}` or `{"force":true}` (force: administrators only, starts a stage out of order) |
| `POST /production/tasks/{id}/complete` | production:update | `{}` or `{"startNext":false}` |
| `POST /production/tasks/{id}/hold` | production:update | `{"reason":"Waiting for ply"}` |
| `POST /production/tasks/{id}/skip` | production:update | `{"reason":"Not needed"}` |
| `POST /production/tasks/{id}/reopen` | production:update | none |
| `POST /production/tasks/{id}/assign` | production:update | `{"userId":"..."}` or `{"userId":null}` |
| `PATCH /production/tasks/{id}/notes` | production:update | `{"notes":"Sanding done"}` |
| `POST /uploads` | by purpose (below) | multipart: `file`, `purpose` |
| `GET /uploads/{id}` | by purpose (read) | none. Streams the file |
| `POST /devices` | signed in | `{"expoPushToken":"ExponentPushToken[...]","platform":"ios","appVersion":"1.0.0"}` |
| `DELETE /devices/{id}` | signed in (own device) | none |

Production actions answer the task as `GET /production/tasks` lists it (`order.status` shows the order moving on
when the last stage ends) with the service's message in `meta.message`.

PDFs: there is no server-side PDF renderer in the codebase (the web prints from the browser: the public `/q/{token}`
and `/i/{token}` pages have a Print button), so `GET /quotations/{id}/pdf` and `/invoices/{id}/pdf` are not provided.
Use `POST .../share` and open the `url`, or print it on the device.

### Idempotency and offline queues

- Every create and every action (`status`, `issue`, `cancel`, `share`, `convert`, production actions, `POST /devices`)
  accepts `Idempotency-Key` (8-128 characters). Generate ONE key per intended action when the user taps, store it
  with the queued request, and send the same key and the same body on every retry.
- A retry with the same key and body gets the first response back, with `Idempotent-Replayed: true` (a replay has no
  `ETag`; `GET` the record for one). Keys are remembered for 24 hours and are per person and company.
- The same key with a different body is `422 IDEMPOTENCY_KEY_REUSED`. A retry while the first request is still
  running is `409 CONFLICT` ("still being processed"): wait a second and retry. A request that failed is not
  remembered, so fixing the data and retrying with the same key is fine.
- `PATCH` and `DELETE` carry no key because repeating them is safe: a replayed `PATCH` writes the same document; a
  `DELETE` retried after it worked is `404`, which a queue should treat as done.
- Queue handling by status: `2xx` done; `401` sign in again; `402 PLAN_LIMIT_REACHED` stop and show the plan screen
  (do not retry); `403` the role cannot do it (drop it and tell the person); `404` the record is gone or belongs
  elsewhere; `409` the state moved on (refetch, show the current state); `422` show `error.fields` against the form
  and keep the item for editing; `429` wait `Retry-After`; `5xx` and network errors retry with the same key and
  growing delays. Writes are limited to 30 a minute per person (uploads 10), so drain a queue slowly.
- Errors are `{ "error": { "code", "message", "fields?", "requestId" } }`; `fields` keys are the body paths
  (`lines.0.quantity`).

### Uploads

1. `POST /uploads` as `multipart/form-data` with `file` and `purpose` (`expense_receipt` needs expense:create,
   `payment_proof` payment:create, `quotation_attachment` quotation:update). Allowed: png, jpeg, webp, gif, heic, heif
   and pdf, at most 10 MB; the first bytes must match the declared type (`422` otherwise). The answer is
   `{ uploadId, url, mime, size, purpose }`. Uploads are limited to 10 a minute.
2. Put the `uploadId` in the record that uses it: `receiptUploadId` on `POST`/`PATCH /expenses`. A receipt can belong
   to one expense (`409` if reused). `payment_proof` and `quotation_attachment` files are stored but no endpoint
   attaches them yet.
3. `GET /uploads/{id}` (bearer and `X-Company-Id`) streams the file with its own content type. Another company's
   file is `404`. `expenseDetail.receiptUploadId` says which upload an expense has.
4. Uploads need object storage (`S3_BUCKET`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`); without
   it `POST /uploads` answers `500` "File uploads are not available right now". Photos that were uploaded but
   never attached keep their `Upload` row with no `linkedAt` (a cleanup job can remove them later).

### Plan limit

`POST /invoices/{id}/issue` (and `POST /invoices` with `"status":"ISSUED"`) uses one of the company's plan invoices.
When `BILLING_ENFORCED=true` and a Free company has issued its 10 free invoices, the answer is
`402 PLAN_LIMIT_REACHED` with the message to show; show the plan screen (`GET /billing` has `manageUrl`; buying is on
the web). Only issuing is limited: drafts, edits, cancelling, payments, sharing and reading keep working, and
cancelling an invoice does not give its slot back. Business and grandfathered companies are never limited. While
`BILLING_ENFORCED` is unset (the default) nothing is refused.

## Full-parity endpoints (M4, planned contract)

Everything the web does has an endpoint. Same conventions as above (bearer, `X-Company-Id`, `Idempotency-Key` on
creates and actions, `ETag` on records, cursor lists, `403`/`404`/`409`/`422` meanings, writes limited to 30 a minute).
Capabilities are the web's, per action. `PATCH` on a document replaces it; `PATCH` on a settings record is partial.
Status: contract listed here first so apps can code against it; each row is marked as it lands in `openapi/prodlys-v1.json`.

### Purchasing and stock

| Endpoint | Capability |
| --- | --- |
| `GET /vendors`, `GET /vendors/{id}` | expense:read |
| `POST /vendors` | expense:create (a duplicate name is `409`) |
| `PATCH /vendors/{id}` | expense:update (whole record) |
| `DELETE /vendors/{id}` | expense:delete (`409` while it has expenses) |
| `GET /vendors/{id}/statement`, `GET /payables` | purchase:read |
| `GET /purchase-orders`, `/purchase-orders/{id}` | purchase:read |
| `POST /purchase-orders` | purchase:create |
| `PATCH /purchase-orders/{id}` | purchase:update (whole document) |
| `POST /purchase-orders/{id}/status` | purchase:update |
| `POST /purchase-orders/{id}/create-bill` | purchase:create |
| `DELETE /purchase-orders/{id}` | purchase:delete |
| `GET /purchase-bills`, `/purchase-bills/{id}` | purchase:read |
| `POST /purchase-bills` | purchase:create |
| `PATCH /purchase-bills/{id}` | purchase:update (whole document) |
| `POST /purchase-bills/{id}/status` | purchase:update (receiving stock also needs stock:create) |
| `POST /purchase-bills/{id}/duplicate` | purchase:create |
| `DELETE /purchase-bills/{id}` | purchase:delete |
| `GET /goods-receipts`, `/goods-receipts/{id}` | purchase:read |
| `GET /goods-receipts/receivable?billId=` or `?poId=` | purchase:read (what is still to receive) |
| `POST /goods-receipts` | stock:create |
| `POST /goods-receipts/{id}/cancel` | stock:update |
| `GET /vendor-payments`, `/vendor-payments/{id}` | purchase:read |
| `POST /vendor-payments` | purchase:update |
| `PATCH /vendor-payments/{id}/allocations` | purchase:update |
| `DELETE /vendor-payments/{id}` | purchase:delete |
| `GET /stock`, `GET /stock/{kind}/{id}` (ledger; kind is `item` or `material`) | stock:read |
| `POST /stock/adjustments`, `POST /stock/opening` | stock:create |
| `PATCH /stock/{kind}/{id}/reorder-level` | item:update |

### Master data and settings

| Endpoint | Capability |
| --- | --- |
| `POST /items`, `PATCH /items/{id}`, `DELETE /items/{id}` | item:create, item:update, item:delete |
| `GET /materials`, `POST /materials`, `PATCH /materials/{id}` (rename, active), `POST /materials/{id}/move`, `DELETE /materials/{id}` | item:read, item:create, item:update, item:update, item:delete |
| `GET /partners`, `/partners/{id}` | partner:read |
| `POST /partners`, `PATCH /partners/{id}`, `POST /partners/{id}/active`, `DELETE /partners/{id}` | partner:create, partner:update, partner:update, partner:delete |
| `GET /settings/payment-modes` (with use counts), `POST`, `PATCH /{id}`, `POST /{id}/move`, `DELETE /{id}` | settings:update |
| `POST /expense-categories`, `PATCH /expense-categories/{id}`, `DELETE /expense-categories/{id}` | expense:create, expense:update, expense:delete |
| `GET /settings/company`, `PATCH /settings/company` | settings:update |
| `POST /settings/company/{logo|signature|stamp}` (multipart `file`), `DELETE` the same | settings:update |
| `GET /settings/stages`, `POST`, `PATCH /{id}`, `POST /{id}/move`, `DELETE /{id}` | settings:update |
| `GET /adjustments`, `/adjustments/{id}` | payment:read |
| `POST /adjustments`, `PATCH /adjustments/{id}`, `DELETE /adjustments/{id}` (balance adjustments, reversals) | settings:update |
| `GET /settings/opening-balances`, `PUT /settings/opening-balances` | settings:update |
| `GET /notes`, `/notes/{id}` (credit and debit notes) | note:read |
| `POST /notes`, `PATCH /notes/{id}`, `POST /notes/{id}/status`, `DELETE /notes/{id}` | note:create, note:update, note:update, note:delete |
| `GET /dispatches`, `/dispatches/{id}`, `GET /dispatches/dispatchable-orders` | dispatch:read |
| `POST /dispatches`, `PATCH /dispatches/{id}`, `POST /dispatches/{id}/status`, `POST /dispatches/{id}/receipt`, `DELETE /dispatches/{id}` | dispatch:create, dispatch:update, dispatch:update, dispatch:update, dispatch:delete |

### Sales gaps

| Endpoint | Capability |
| --- | --- |
| `DELETE /customers/{id}` | customer:delete |
| `DELETE /quotations/{id}`, `POST /quotations/{id}/revision` | quotation:delete, quotation:create |
| `DELETE /quotations/{id}/share` (revoke the link) | quotation:update |
| `POST /quotations/{id}/attachments` (`uploadId`), `DELETE /quotations/{id}/attachments/{attachmentId}` | quotation:update |
| `DELETE /orders/{id}` | order:delete |
| `POST /orders/{id}/tracking`, `DELETE /orders/{id}/tracking` (create or replace, revoke the link) | order:update |
| `DELETE /invoices/{id}`, `POST /invoices/{id}/duplicate` | invoice:delete, invoice:create |
| `POST /invoices/{id}/payments`, `DELETE /invoices/{id}/allocations/{allocationId}` | payment:create, payment:update |
| `POST /invoices/{id}/write-off`, `DELETE /invoices/{id}/write-offs/{writeOffId}` | invoice:update |
| `PATCH /payments/{id}/allocations` | payment:update |

### Account, team, billing, search

| Endpoint | Capability |
| --- | --- |
| `GET /me` (each company also has `industryName`, `terms`, `modules`) | signed in |
| `GET /industries` | signed in (templates: terms, modules, stages, units) |
| `GET /team/members` | user:read |
| `PATCH /team/members/{userId}` (role), `DELETE /team/members/{userId}` (remove) | user:update |
| `GET /invitations`, `POST /invitations`, `DELETE /invitations/{id}`, `POST /invitations/{id}/regenerate` | user:update (create returns the link and a WhatsApp text/link) |
| `GET /invitations/preview?token=` | signed in |
| `POST /invitations/accept` | signed in (already live) |
| `GET /billing/payments`, `POST /billing/checkout` (returns `redirectUrl` to open in the browser) | settings:update |
| `GET /search?q=` | per type: customer, partner, item, quotation, order, invoice read |
| `GET /export/{kind}` (CSV: customers, quotations, orders, invoices, payments, expenses, purchase-bills, purchase-orders, vendor-payments, stock) | the kind's read capability |

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

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
| `GET /reports/compare?period=week\|month\|year` | invoice:read (each metric inside is left out without its own capability, see the schema) |
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
| `GET /audit`, `/{customers,quotations,orders,invoices,payments,expenses,vendors,purchase-bills}/{id}/history` | settings:update (log); the record's own read capability (history). See Audit trail |
| `GET /states` | public, `Cache-Control: public, max-age=86400`, ETag |

`GET /reports/compare` compares this week, month or year (`period=`; ISO weeks, Monday first; a year is the calendar
year, India time) to date against the same number of days of the previous period and of a year ago. Each metric has
`current`, `previous`, `lastYear`, a change against each (`abs`, `pct`, `kind` of `up|down|flat|new`, `tone` of
`good|bad|neutral`) and a 12-period `series` whose points carry their year-earlier value for the overlay. `pct` is
`null` and `kind` is `new` when the earlier figure was 0 (show the word, never a percent). `tone` already knows that
more expenses is bad. Money is a decimal string, counts are integer strings. Net cash is collections minus expenses;
receivables is billed to date minus received to date at the end of the slice. Metrics the role may not read are left
out of `metrics`.

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
| `DELETE /payments/{id}` | payment:delete | none; send `X-Audit-Reason` (see Audit trail). Allocations go with it; an order advance is `409` |
| `POST /expenses` | expense:create | `{"payeeName","expenseDate","amount","taxRatePercent":18,"methodId","details":{},"receiptUploadId":"..."}` |
| `PATCH /expenses/{id}` | expense:update | the whole expense; leaving `receiptUploadId` out keeps the receipt, `null` removes it |
| `DELETE /expenses/{id}` | expense:delete | none, but **a reason is required** (see Audit trail) |
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

## Audit trail

Every change to business data is recorded by the database itself (docs/AUDIT.md): who, when, from where, and the
record before and after. The app does not have to send anything for that to work; what it should send is below.

**Source and actor.** Every API write is attributed to the signed-in person (`actorUserId`, name and role at that
time) with `source: "api"`. When the request carries `X-Client: prodlys-mobile` (or a user agent containing `Expo`) the
source is `"mobile"` instead. Send the header on every call from the app. The request id of the call is stored with the
change, so a support question ("what happened on this request?") can be answered from the log.

**Reasons.** When deleting or reversing a money record (payments, expenses, adjustments, notes, purchase bills,
vendor payments, ...) send `X-Audit-Reason: Entered twice by mistake` (or `?reason=`); it is kept with the full copy of
the record. On any other write it is optional. The web always requires one. For the API it is **optional by default**,
so app builds already installed keep working; the server flips to required with `AUDIT_REASON_REQUIRED=true`, after which
a delete without one is `422 VALIDATION_FAILED` with `fields.reason`. Ship the header in the app before flipping it.
`POST /adjustments/{id}/reverse` creates a linked opposite entry dated today (the original stays).

**Closed books.** An administrator can close the books up to a date (web: Settings, Audit log). Creating, changing or
deleting a record dated on or before it is `409 CONFLICT` for everyone but a company administrator, who must send
`X-Audit-Reason`.

**Reading the trail.**

| Path | Capability | Answer |
| --- | --- | --- |
| `GET /audit` | settings:update | The company's log, newest first. `?limit=&cursor=` plus filters `entity` (e.g. `Invoice`), `entityId`, `actor` (user id), `action` (create, update, delete, status, restore, baseline), `source` (web, api, mobile, system, webhook, seed, public), `from`/`to` (UTC days, inclusive), `q` (record number or id, person, words) |
| `GET /{customers,quotations,orders,invoices,payments,expenses,vendors,purchase-bills}/{id}/history` | that record's read capability | Every event of the record and its line items, newest first, cursor-paged. A record of another company is `404` (a deleted record keeps its history) |

An event: `{ id, seq, occurredAt, actor: { id, name, role }, source, requestId, entityType, entityLabel, entityId,
parentType, parentId, action, summary, reason, correlationId, changes: [{ field, label, before, after }] }`.
`changes` carries the raw values (a create has no `before`, a delete no `after`); secrets (password hashes, tokens,
all but the last four digits of a bank account number) are masked as `"[redacted]"` / `"••••1234"`. Events changed
together (one save touching an invoice and its lines) share `correlationId`. `seq` rises by one per company, so a
client can detect a gap.
## Full-parity endpoints (M4, planned contract)

Everything the web does has an endpoint. Same conventions as above (bearer, `X-Company-Id`, `Idempotency-Key` on
creates and actions, `ETag` on records, cursor lists, `403`/`404`/`409`/`422` meanings, writes limited to 30 a minute).
Capabilities are the web's, per action. `PATCH` on a document replaces it; `PATCH` on a settings record is partial.
Status: contract listed here first so apps can code against it; each row is marked as it lands in `openapi/prodlys-v1.json`.

### Purchasing and stock

Lists (cursor pagination as above): vendors by name, purchase orders by order date, bills by bill date, goods
receipts by received date, vendor payments by payment date (newest first), stock by name. Records carry an `ETag`.
Documents (`purchase-orders`, `purchase-bills`) and vendors are replaced whole by `PATCH`; dates are `YYYY-MM-DD`.
The rules are the web's: the endpoints call the same services (`src/lib/services/purchase-orders.ts`,
`purchase-bills.ts`, `vendors.ts`, `goods-receipts.ts`, `vendor-payments.ts`, `stock.ts`).

| Endpoint | Capability | Body (example) |
| --- | --- | --- |
| `GET /vendors?q=&includeInactive=`, `GET /vendors/{id}` | expense:read | |
| `POST /vendors` | expense:create | `{"name":"Ply House","phone":"9876500002","gstin":"24ABCDE1234F1Z5","city":"Surat","openingPayable":1000,"openingAsOf":"2026-04-01"}` (a duplicate name is `409`; `openingAsOf` is required with an opening payable) |
| `PATCH /vendors/{id}` | expense:update | the whole vendor (`isActive` left out means `true`) |
| `DELETE /vendors/{id}` | expense:delete | none. `409` while it has expenses (mark it inactive instead) |
| `GET /vendors/{id}/statement` | purchase:read | none. Open bills, then bills and payments with a running balance |
| `GET /payables` | purchase:read | none. Totals, ageing buckets and a row per vendor with something due |
| `GET /purchase-orders?q=&status=`, `/purchase-orders/{id}` | purchase:read | |
| `POST /purchase-orders` | purchase:create | `{"vendorId":"...","orderDate":"2026-11-15","expectedDate":"2026-11-25","notes":"","lines":[{"itemId":"...","description":"Ply 18mm","qty":10,"unit":"SHEET","rate":1800,"taxRatePercent":18}]}` (a line points at an `itemId` or a `materialId`, or neither for free text; a new order is a DRAFT) |
| `PATCH /purchase-orders/{id}` | purchase:update | the same document; a received or cancelled order is `409` |
| `POST /purchase-orders/{id}/status` | purchase:update | `{"status":"SENT"}` (an illegal move is `409`) |
| `POST /purchase-orders/{id}/create-bill` | purchase:create | none. `201` with a draft bill copied from the order (`409` for a cancelled order) |
| `DELETE /purchase-orders/{id}` | purchase:delete | none. Draft or cancelled orders without bills or receipts only |
| `GET /purchase-bills?q=&status=`, `/purchase-bills/{id}` | purchase:read | `paid`, `due` and `paymentStatus` are computed for posted bills |
| `POST /purchase-bills` | purchase:create | `{"vendorId","poId":null,"vendorBillNumber":"VB-77","billDate":"2026-11-15","dueDate":"2026-12-15","isInterState":false,"lines":[{"description":"Ply","qty":10,"unit":"SHEET","rate":1800,"discount":0,"taxRatePercent":18}]}` (a DRAFT; GST totals come back) |
| `PATCH /purchase-bills/{id}` | purchase:update | the same document; a posted bill is `409` (move it back to draft first) |
| `POST /purchase-bills/{id}/status` | purchase:update | `{"status":"POSTED"}` or `{"status":"POSTED","receiveNow":true}` (the latter also needs stock:create). A bill with payments cannot leave POSTED |
| `POST /purchase-bills/{id}/duplicate` | purchase:create | none. `201`, a draft copy |
| `DELETE /purchase-bills/{id}` | purchase:delete | none. `409` for a posted bill, or one with payments or receipts |
| `GET /goods-receipts?q=&status=`, `/goods-receipts/{id}` | purchase:read | |
| `GET /goods-receipts/receivable?billId=` or `?poId=` | purchase:read | what is still to receive: `lines[].lineId` and `remaining` feed the next call |
| `POST /goods-receipts` | stock:create | `{"billId":"...","receivedOn":"2026-11-15","notes":"","lines":[{"lineId":"<receivable lineId>","qty":4}]}` (or `poId` instead of `billId`). Adds to stock |
| `POST /goods-receipts/{id}/cancel` | stock:update | `{}` or `{"allowNegative":true}` (administrators only). Reverses the stock; below zero is `409` |
| `GET /vendor-payments?q=&mode=&from=&to=`, `/vendor-payments/{id}` | purchase:read | |
| `POST /vendor-payments` | purchase:update | `{"vendorId","amount":5000,"methodId":"<GET /payment-methods id>","paidOn":"2026-11-15","details":{...},"allocations":[{"billId","amount":3000}],"openingApplied":0}` (same auto-apply rules as the web when neither is sent) |
| `PATCH /vendor-payments/{id}/allocations` | purchase:update | `{"allocations":[{"billId","amount":3000}],"openingApplied":0}` (the full new split) |
| `DELETE /vendor-payments/{id}` | purchase:delete | none. The bills owe again |
| `GET /stock?q=&filter=all\|low\|out\|negative` | stock:read | |
| `GET /stock/{kind}/{id}` | stock:read | `kind` is `item` or `material`. Ledger, oldest first with a running balance |
| `POST /stock/adjustments` | stock:create | `{"kind":"item","id":"...","qty":-2,"reason":"Damaged","date":"2026-11-15"}` (below zero is `409`; `"allowNegative":true` works for administrators) |
| `POST /stock/opening` | stock:create | `{"kind":"material","id":"...","qty":50,"unitCost":12.5}` (once per item or material) |
| `PATCH /stock/{kind}/{id}/reorder-level` | item:update | `{"reorderLevel":10}` or `{"reorderLevel":null}`. The item must have Track stock on |

Quantities and rates come back as decimal strings and go in as JSON numbers. Receipts have no edit stamp, so
their `updatedAt` is the recorded time (as for payments).

### Master data and settings

Settings lists are small, so **materials, payment modes and production stages answer the whole updated list after
every change** (a screen just replaces its copy). Other records answer the saved record like the rest of the API.
`PATCH` on a master record (item, partner, payment mode, expense category, company profile, material, stage) is
**partial**: only the fields sent change (`null` clears an optional one) and the merged record goes through the web's own
validation. `PATCH` on a document (note, dispatch, adjustment) replaces it. A refusal that is a state rule is `409`.

| Endpoint | Capability | Body (example) |
| --- | --- | --- |
| `POST /items` | item:create | `{"name":"Plywood 18mm","unit":"SQFT","rate":120,"taxRatePercent":18,"materialId":"...","stockTracked":true,"reorderLevel":50}` (same fields as the web form; code is assigned) |
| `PATCH /items/{id}` | item:update | `{"rate":130}` |
| `DELETE /items/{id}` | item:delete | `409` while the item is on a document line (set `isActive:false` instead) |
| `GET /materials` | item:read | every material, inactive too: `{id,name,sortOrder,isActive,stockTracked,reorderLevel,itemCount}` |
| `POST /materials` | item:create | `{"name":"Hardware"}` (`201`, the whole list; a repeated name is `409`) |
| `PATCH /materials/{id}` | item:update | any of `{"name","isActive","stockTracked","reorderLevel"}` (the reorder level of a stock-tracked material; the whole list comes back) |
| `POST /materials/{id}/move` | item:update | `{"direction":"up"}` |
| `DELETE /materials/{id}` | item:delete | `409` while items use it |
| `GET /partners`, `GET /partners/{id}` | partner:read | list takes `?q=&type=ARCHITECT\|CARPENTER&includeInactive=true`, name order, cursor |
| `POST /partners` | partner:create | `{"type":"ARCHITECT","name":"Ravi Shah","phone":"9876500001","firmName":"RS Studio","city":"Surat"}` |
| `PATCH /partners/{id}` | partner:update | `{"city":"Vapi"}` (the type is fixed) |
| `POST /partners/{id}/active` | partner:update | `{"isActive":false}` |
| `DELETE /partners/{id}` | partner:delete | `409` while customers, quotations or orders point at it |
| `GET /settings/payment-modes` | settings:update | every mode with `details`, `accountDetails`, `showOnDocuments`, `hasQr`, `usage` |
| `POST /settings/payment-modes` | settings:update | `{"name":"HDFC UPI","kind":"UPI","accountDetails":{"upiId":"acme@hdfc"},"showOnDocuments":true,"details":[{"label":"Bank","value":"HDFC"}]}` (`201`, whole list; the receiving fields per kind are the ones `GET /payment-methods` describes) |
| `PATCH /settings/payment-modes/{id}` | settings:update | any of `name, kind, details, accountDetails, showOnDocuments, isActive` (hiding the last active mode is `409`) |
| `POST /settings/payment-modes/{id}/move` | settings:update | `{"direction":"down"}` |
| `DELETE /settings/payment-modes/{id}` | settings:update | `409` once it has been used (hide it instead) |
| `GET`/`POST`/`DELETE /settings/payment-modes/{id}/qr` | payment:read / settings:update | the QR image; `POST` is multipart `file` (PNG, JPEG or WebP, 10 MB), answers the mode |
| `GET /settings/expense-categories` | expense:read | every category, inactive too, with `expenseCount` (the existing `GET /expense-categories` stays the active-only picker list) |
| `POST /expense-categories` | expense:create | `{"name":"Fuel","sortOrder":10}` |
| `PATCH /expense-categories/{id}` | expense:update | `{"isActive":false}` |
| `DELETE /expense-categories/{id}` | expense:delete | `409` while expenses use it |
| `GET /settings/company` | settings:update | the profile (`ETag`); `hasLogo`, `hasSignature`, `hasStamp` |
| `PATCH /settings/company` | settings:update | `{"companyName":"Acme Interiors","gstin":"24ABCDE1234F1Z5","defaultAdvancePercent":70,"invoiceTerms":"..."}` |
| `GET`/`POST`/`DELETE /settings/company/{logo\|signature\|stamp}` | settings:update | the image; `POST` is multipart `file` (PNG, JPEG or WebP, 10 MB) and answers the profile |
| `GET /settings/stages` | settings:update | every stage in order with `linkedStatus` and `taskCount` |
| `POST /settings/stages` | settings:update | `{"name":"Polish"}` (`201`, whole list) |
| `PATCH /settings/stages/{id}` | settings:update | any of `{"name","isActive","linkedStatus":"READY"\|null}` (retiring a stage with open tasks is `409`) |
| `POST /settings/stages/{id}/move` | settings:update | `{"direction":"up"}` |
| `DELETE /settings/stages/{id}` | settings:update | `409` while tasks are on record (retire it) |
| `GET /adjustments`, `GET /adjustments/{id}` | payment:read | `?q=&kind=&reason=&from=&to=`, newest first, cursor; `amount` is signed |
| `POST /adjustments` | settings:update | `{"kind":"CHANNEL","targetId":"<payment mode id>","direction":"up","amount":500,"adjustedOn":"2026-11-15","reason":"FORGOTTEN_ENTRY","note":"Cash found in drawer"}` (`kind` `CUSTOMER` takes a customer id) |
| `PATCH /adjustments/{id}` | settings:update | the same body; only amount, date, reason and note change |
| `DELETE /adjustments/{id}` | settings:update | reverses it: the balance is back as it was |
| `GET /settings/opening-balances` | settings:update | per payment mode: `{channelId,name,isActive,amount,asOf}` |
| `PUT /settings/opening-balances` | settings:update | `{"balances":[{"channelId":"...","amount":-2500.5,"asOf":"2026-04-01"},{"channelId":"...","amount":null,"asOf":null}]}` (`null` removes an entry; the whole list comes back; customer and vendor opening balances are on their own records) |
| `GET /notes`, `GET /notes/{id}` | note:read | `?q=&kind=CREDIT\|DEBIT&status=`, newest first, cursor; detail has the lines and GST split |
| `POST /notes` | note:create | `{"kind":"CREDIT","partyType":"CUSTOMER","customerId":"...","invoiceId":"...","reason":"SALES_RETURN","noteDate":"2026-11-15","lines":[{"description":"Returned panel","quantity":1,"rate":1200,"taxRatePercent":18}]}` (a `VENDOR` note sends `vendorName` instead of `customerId`) |
| `PATCH /notes/{id}` | note:update | the same document; draft only (an issued note is `409`) |
| `POST /notes/{id}/status` | note:update | `{"status":"ISSUED"}` (`DRAFT`, `ISSUED`, `CANCELLED`; the same status again is `409`) |
| `DELETE /notes/{id}` | note:delete | an issued note is `409` (cancel first) |
| `GET /dispatches`, `GET /dispatches/{id}` | dispatch:read | `?q=&status=`, newest first, cursor |
| `GET /dispatches/dispatchable-orders`, `GET /dispatches/dispatchable-orders/{orderId}` | dispatch:read | orders a challan can be made for, and one order with `ordered`, `dispatched`, `remaining` per line |
| `POST /dispatches` | dispatch:create | `{"orderId":"...","dispatchDate":"2026-11-15","status":"DRAFT","vehicleNumber":"GJ05AB1234","lines":[{"orderLineId":"...","description":"Wardrobe","unit":"NOS","quantity":1}]}` (a line over what is left is `422` with `fields`) |
| `PATCH /dispatches/{id}` | dispatch:update | the same document; one already delivered is `409` |
| `POST /dispatches/{id}/status` | dispatch:update | `{"status":"DISPATCHED"}` (an illegal move is `409`) |
| `POST /dispatches/{id}/receipt` | dispatch:update | `{"receivedByName":"Mohan"}` |
| `DELETE /dispatches/{id}` | dispatch:delete | only a draft or cancelled challan (`409` once goods left) |

Every create above and every action (`status`, `active`, `move`, `receipt`) takes an `Idempotency-Key`; `PATCH`, `PUT`
and `DELETE` do not (repeating them is safe). Image uploads are limited to 10 a minute like `POST /uploads`.

### Sales gaps

Deletes answer `{ "data": { "id", "deleted": true } }`; the rules are the web's (a record that is still in use is `409`).

| Endpoint | Capability | Body (example) |
| --- | --- | --- |
| `DELETE /customers/{id}` | customer:delete | none. `409` while it has quotations, orders, invoices, receipts or notes (set it INACTIVE) |
| `DELETE /quotations/{id}` | quotation:delete | none. `409` while orders or later revisions point at it |
| `POST /quotations/{id}/revision` | quotation:create | none. `201` with the new draft quotation |
| `DELETE /quotations/{id}/share` | quotation:update | none. Revokes the customer link (`409` if none is active) |
| `POST /quotations/{id}/comments` | quotation:update | `{"body":"Please make it darker","attachmentId":null}` |
| `POST /quotations/{id}/attachments` | quotation:update | `{"uploadId":"...","fileName":"wall.jpg","comment":"reference"}` (uploadId from `POST /uploads` purpose `quotation_attachment`). `201 {id,fileName,mimeType,sizeBytes,comment,approvalCleared}`; clears a customer approval like the web; a converted quotation is `409` |
| `PATCH /quotations/{id}/attachments/{attachmentId}` | quotation:update | `{"comment":"new text"}` |
| `DELETE /quotations/{id}/attachments/{attachmentId}` | quotation:update | none (takes it out of the current set) |
| `POST /quotations/{id}/attachments/{attachmentId}/restore` | quotation:update | none |
| `DELETE /orders/{id}` | order:delete | none |
| `POST /orders/{id}/tracking` | order:update | `{}` (the active link or a new one) or `{"replace":true}`; answers `{url,token,whatsappText,whatsappLink,created}` |
| `DELETE /orders/{id}/tracking` | order:update | none. Revokes the link (`409` if none) |
| `DELETE /invoices/{id}` | invoice:delete | none. Drafts only |
| `POST /invoices/{id}/duplicate` | invoice:create | none. `201` with the new draft invoice |
| `POST /invoices/{id}/payments` | payment:create | `{"amount":500,"methodId":"<GET /payment-methods id>","paidOn":"2026-11-15","reference":"UTR123","notes":null}`. `201` with the invoice |
| `DELETE /invoices/{id}/payments/{paymentId}` | payment:delete | none. Unapplies that receipt (`paymentId` from the invoice's `payments`) from the invoice; answers the invoice |
| `POST /invoices/{id}/write-off` | payment:update | `{"amount":50,"reason":"DISPUTE","writtenOffOn":"2026-11-15","notes":null}`. `201` with the invoice |
| `DELETE /invoices/{id}/write-offs/{writeOffId}` | payment:update | none. Answers the invoice |
| `POST /invoices/{id}/share/regenerate` | invoice:update | none. A fresh link (the old one stops opening); issued invoices only |
| `PATCH /payments/{id}/allocations` | payment:update | `{"allocations":[{"invoiceId":"...","amount":100}],"openingApplied":0}` (replaces what the receipt settles) |

Not exposed: attaching a `payment_proof` upload to a payment (the data model has no proof field on a payment, so there
is nothing to attach it to), and a quotation share "regenerate" (the web has only create and revoke for quotations).

### Account, team, billing, search

Live. `GET /me` (and `POST /companies`) answer every company with `role`, `capabilities`, `industry`, `industryName`,
`terms` (what the company calls an order: `{"orders":"Bookings","order":"Booking"}`) and `modules`
(`{"production":true,"dispatch":true,"partners":true}`; hide a screen when false). Switching company is client-side:
send the other company's id as `X-Company-Id`. Adding a company is `POST /companies` (same 3-company cap as the web).

| Endpoint | Capability | Body (example) |
| --- | --- | --- |
| `GET /industries` | signed in | none. Templates with terms, modules, stages, units, expense categories (ETag) |
| `GET /team/members` | user:update | none. `[{id,name,email,role,isSuperAdmin}]` |
| `POST /team/members` | user:update | `{"email":"mira@example.com","role":"SALES"}`. Adds an existing account (`422` on `email` when none exists, `409` when already a member) |
| `PATCH /team/members/{userId}` | user:update | `{"role":"ACCOUNTANT"}`. The last administrator cannot be demoted (`409`); someone not on this team is `404` |
| `DELETE /team/members/{userId}` | user:update | none. Removes them from this company, not the account |
| `GET /invitations` | user:update | none. Each has `url`, `token`, `whatsappText`, `whatsappLink` |
| `POST /invitations` | user:update | `{"role":"SALES","phone":"9876543210","email":"","note":"Showroom"}`. Capped per company (`409`) |
| `DELETE /invitations/{id}` | user:update | none. Revokes the link (`409` if not open) |
| `POST /invitations/{id}/regenerate` | user:update | none. New link and expiry (resend) |
| `GET /invitations/preview?token=` | signed in | the join screen: `{companyName, role, inviterName, emailHint, expiresAt, status, usable}`; `404` for an unknown token |
| `POST /invitations/accept` | signed in | `{"token":"..."}` (live since M1) |
| `GET /billing/payments` | settings:update | none. Last 20 plan payments |
| `POST /billing/checkout` | settings:update | `{"plan":"BUSINESS"}`. Returns `{paymentId, redirectUrl}`: open `redirectUrl` in the system browser, then poll `GET /billing`. App-store rules about selling plans in-app are the product's call; the endpoint is the same as the web button |
| `GET /search?q=` | none; each group needs its read capability | `[{id,group,title,subtitle,type,recordId}]`, at most 5 per group, `q` of 2+ characters. `type` is customer, partner, item, quotation, order or invoice |
| `GET /export/{kind}?q=&status=` | the kind's read capability | CSV (`text/csv`, UTF-8 with BOM) of customers, quotations, orders, invoices, payments, expenses, purchase-bills, purchase-orders, vendor-payments or stock |

There are no notification preferences on the web (only device registration, `POST /devices`), so none are exposed.

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

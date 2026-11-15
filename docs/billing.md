# Billing (Prodlys charging its own customers)

Status: foundation. Plans, entitlements, payments (PhonePe), the Plan & billing screen, the
platform-admin screen and the read-only API are built. **Enforcement is off** (`BILLING_ENFORCED`
defaults to `false`) and the guard is wired into the invoice services (see "Call sites").

## 1. Goals

- Charge for Prodlys per **company** (a subscription belongs to a company, not a user), yearly, in INR.
- Never break existing customers: every company that exists at deploy is grandfathered.
- Never hold a customer's data hostage: after the free quota a company can still read, edit, print, share,
  export and record payments. Only **issuing new invoices** is blocked, with a friendly paywall.
- Ship the UI before payments are live: quota is computed and shown, but blocking is a switch.

## 2. Plans (source of truth: `src/lib/billing/plans.ts`)

| Plan | Price / year | List ("was") price | Invoices | Notes |
| --- | --- | --- | --- | --- |
| FREE | 0 | none | 10 issued, lifetime per company | drafts unlimited |
| BUSINESS | 399 | 799 | unlimited | |
| BUSINESS_PRO | 999 | 3,999 | unlimited | `aiPreview` flag and badge only; no AI feature exists |

**What counts toward the quota:** invoices that were ever issued (DRAFT to ISSUED), counted once and never
decremented. Cancelling an issued invoice does not free a slot; a draft cancelled before issue never counted.

**Expiry:** a paid year has an end date. 30 days before it a reminder banner shows. After it, a **7 day grace
period** keeps paid limits. After grace the company falls back to FREE entitlements (data intact; if the quota is
already exceeded, issuing is blocked). Grandfathered and manual plans may have no end date.

**Mid-year changes:** a new purchase starts at `max(now, current end)`, so buying early wastes nothing. A lower
plan never downgrades a higher one that is still running (checkout refuses it; a stale paid order is recorded
but leaves the plan alone and is flagged for a refund, see open questions).

## 3. Data model (migration `20261118110000_billing`, additive)

- `CompanySubscription` (one per company, unique `company_id`): plan, status (ACTIVE/EXPIRED/CANCELLED),
  source (SELF_SERVE/GRANDFATHERED/MANUAL), `currentPeriodStart`, `currentPeriodEnd` (null = no expiry),
  `graceUntil` (null = default 7 days).
- `BillingPayment` (company scoped): plan, `amountPaise`, currency, `taxPaise` (0 for now), status
  (CREATED/PAID/FAILED/REFUNDED), `provider` (PHONEPE or MOCK), `providerOrderId` (**our merchantOrderId**,
  unique, equals the row id), `providerPaymentId` (the gateway's order id, unique, nullable), period, createdBy,
  paidAt. Only ids, amounts and status are stored: no card or UPI details, no raw gateway payloads.
- Both tables are in `SCOPED` (`src/lib/tenant-rules.ts`); the classification test covers them.
- `Invoice.issuedAt`: there was **no reliable "first issued" field** (status only; `updatedAt` changes on every
  edit), so it was added. It is stamped by a **database trigger** on the first move to ISSUED and can never be
  cleared, so every code path (web, API, imports) is covered without touching the invoice code that other PRs
  are refactoring. The migration backfills ISSUED and CANCELLED invoices with `updated_at`.
- Usage is computed, not stored: `count(invoices where issuedAt is not null or status = ISSUED)`.
- **Grandfathering:** the migration inserts a `BUSINESS / GRANDFATHERED / no expiry` row for every existing
  company. New companies get a `FREE` row inside `createCompanyWithSeed` (covers the web onboarding, the admin
  "add company" action and `POST /api/v1/companies`); a company with no row (any other creation path, restored
  data) is treated as FREE and the row is created on first read.

## 4. Flows

**Buy (web only).** Plan & billing -> "Upgrade to <plan>" -> server action `startCheckout` creates a
`BillingPayment` (CREATED) and a gateway order (`POST /checkout/v2/pay`) -> the browser is redirected to
the gateway's hosted page (UPI, cards, net banking, wallets) -> PhonePe returns to
`/settings/billing/return?order=<id>` -> that page asks PhonePe for the order status **server side** and, if
COMPLETED with the exact amount, upgrades the company once. The redirect query is never trusted.

**Webhook.** `POST /api/billing/phonepe/webhook`: raw body, credential check (timing safe), then the order is
**re-verified with the status API** before anything changes; the company comes from our `BillingPayment` row
found by `merchantOrderId`, never from the body. Answers 200 fast; unknown orders and other events are
acknowledged and ignored; 401 for bad credentials. Idempotent: the first caller flips CREATED to PAID inside a
transaction (`updateMany ... status != PAID`), a second one changes nothing.

**Manual (platform admin).** `/admin/billing` lists every company with plan and usage; "Set plan" writes a
`MANUAL` subscription with a required reason, recorded in the activity log.

**Mobile API.** `GET /api/v1/billing` (company header): plan, state, entitlements, usage, `renewsOn`,
`manageUrl`. Documented in the OpenAPI spec.

**User-facing wording.** The payment provider is never named in the UI (buttons, toasts, errors, return page,
history). Buttons read "Upgrade to Business" / "Renew Business", the helper line is "Pay securely with UPI,
cards or net banking", and the history "Method" column says "Online" (the method is not stored). The provider
name appears only in code, env var names, docs and server logs.

## 5. Security

- Webhook credentials: PhonePe sends `Authorization: <sha256 hex of "username:password">`; we compare with
  `timingSafeEqual`. No credentials configured means every webhook is refused.
- Money moves only after a server-to-server status call that returns COMPLETED and an amount equal to ours.
- Secrets (client secret, webhook password) are read from env and never logged or put in error messages.
- Company isolation: services take the company explicitly and filter by it; confirming another company's
  order returns "not found" (tested).
- Settings and checkout need `settings:update`; manual plans need a platform super-admin.

## 6. Environment variables

| Variable | Meaning |
| --- | --- |
| `BILLING_ENFORCED` | `true` to block issuing past the quota. Default `false`. |
| `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` | PhonePe PG merchant credentials |
| `PHONEPE_ENV` | `sandbox` (default) or `production` |
| `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD` | The pair configured on the PhonePe dashboard webhook |
| `BETTER_AUTH_URL` | Used to build the return URL (must be the public app URL) |
| `BILLING_PROVIDER=mock` | Local development and tests only |

Without the PhonePe keys the upgrade buttons show "Paid plans open soon" and nothing else changes.
Webhook URL to register: `https://app.prodlys.com/api/billing/phonepe/webhook` (events
`checkout.order.completed`, `checkout.order.failed`).

PhonePe URLs and field names live in `src/lib/billing/phonepe-constants.ts` (one file, flagged "VERIFY AGAINST
PHONEPE DOCS"). They were checked against the Standard Checkout v2 reference pages. Still unconfirmed: the webhook
header encoding (we accept hex, with or without a `SHA256 ` prefix) and the exact spelling of the create-payment
expiry field (not read by us). Test in the PhonePe sandbox before going live.

## 7. Call sites of the guard (wired)

`assertCanIssueInvoice(companyId, count = 1)` from `src/lib/billing/guard.ts` throws
`DomainError('...', 'PLAN_LIMIT_REACHED')` (HTTP 402) when blocked and enforcement is on. It runs in the service
layer, before the write, so the web actions and `/api/v1` share it:

1. `changeInvoiceStatus` in `src/lib/services/invoices.ts` on DRAFT -> ISSUED. A draft that was issued before
   (it has `issuedAt`) already holds its slot and is never refused. Cancel, back-to-draft, edits, payments,
   sharing and printing are not guarded.
2. `createInvoice` in the same file when the new invoice is created as ISSUED.
3. There is no other path: the quick invoice from an order (`createInvoiceFromOrder`) and `duplicateInvoice`
   always make drafts, and there is no bulk issue (a future one must pass `count`).
4. API: `POST /api/v1/invoices/{id}/issue` and `POST /api/v1/invoices` with `status: "ISSUED"` (402).

The web actions (`setInvoiceStatus`, `createInvoice` in `src/lib/actions/invoices.ts`) catch the error with
`planLimitMessage` (`src/lib/billing/web.ts`) and show the paywall message with a link to `/settings/billing`.
A cancelled invoice still counts (the quota counts every invoice ever issued), so cancelling frees no slot.

## 8. Rollout

1. Merge and deploy with `BILLING_ENFORCED` unset: the migration grandfathers everyone, new companies start
   FREE and see "n of 10 free invoices used"; nothing is blocked.
2. Set the PhonePe sandbox keys on a staging environment; run a real sandbox purchase and a webhook.
3. The guard is wired (section 7); check an issue on a Free company with enforcement on a staging copy.
4. Production keys, register the webhook, then set `BILLING_ENFORCED=true`.

## 9. Risks

- **Mobile apps must not sell plans.** Apple and Google in-app purchase rules apply to digital subscriptions
  sold inside an app. The apps only display plan status (`GET /api/v1/billing`) and a "manage on the web" link
  (`manageUrl`). No purchase button, price list or "upgrade" call to action that completes a payment in-app.
- Webhook header and field details need sandbox confirmation (section 6).
- The mock provider must never be enabled in production (`BILLING_PROVIDER` unset there).
- Grandfathered companies have no expiry; revisit if that should change.
- A user who pays after a higher plan is already running gets the payment recorded but no plan change: needs a
  refund process.
- The invoice trigger and backfill: cancelled invoices that were never issued are backfilled as issued (old data
  cannot tell them apart). Harmless for grandfathered companies.

## 10. TODO: our own tax invoice (out of scope for now)

The seller is **TECHARDENT INTERNET PRIVATE LIMITED**. A compliant GST tax invoice or receipt must be generated
for every payment. That needs the entity's GSTIN, the SAC code and a decision on whether the prices are
GST-inclusive or exclusive. Today `taxPaise = 0` and `amountPaise` is exactly what was charged. The billing
history "Receipt" column shows the PhonePe order id as a placeholder reference.

## 11. Open questions for the owner

- Are 399 / 999 GST-inclusive or exclusive? (Changes the amount charged and the invoice.)
- SAC code and GSTIN for our own tax invoices; who issues them and when.
- Refund policy, and what to do with a payment that arrives for a lower plan while a higher one runs.
- Should grandfathered BUSINESS ever expire or move to paid? Should existing companies see any plan messaging?
- Should drafts created past the quota be allowed to be shared as quotations only? (Current rule: yes, only
  issuing is blocked.)
- Any promo codes or multi-year purchases?

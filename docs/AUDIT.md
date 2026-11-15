# Audit trail

Every change to business data is attributable (who, from where, on whose
request), reconstructable (the record before and after) and tamper-evident (it
can not be edited or removed without the break showing).

## How it works

```
 web action / API route / script
        |  (AsyncLocalStorage: actor, source, request id, ip, reason)
        v
 Prisma client  ->  tenant extension  ->  driver-adapter wrapper  ->  Postgres
                                           sets audit.ctx for the         |
                                           transaction before any         |  AFTER INSERT/UPDATE/DELETE
                                           write statement                v  trigger on every audited table
                                                                    audit_events (append-only, hash chained)
```

- **Capture is in the database**: an `AFTER ... FOR EACH ROW` trigger on each
  audited table inserts one `audit_events` row in the *same transaction* as the
  change. No change without an event, no event without a change (a rolled-back
  transaction leaves neither). It also covers what an application hook can not
  see: nested writes (a quotation and its lines), `createMany`/`updateMany`
  (one event per row), batch transactions, raw SQL, cascading deletes, scripts
  and `psql`. Services do not have to remember to log anything.
- **Attribution comes from the application**: the Prisma driver adapter
  (`src/lib/audit-trail/adapter.ts`) runs `set_config('audit.ctx', <json>, true)`
  inside the same transaction, before the first write statement of that
  transaction (a write outside a transaction gets one of its own). The trigger
  reads it. The context is resolved by `src/lib/audit-trail/context.ts`:
  - API requests: `apiRoute` runs the handler in the request context with the
    caller, role, request id, IP and user agent. `source` is `mobile` when the
    request has `X-Client: prodlys-mobile` (or an Expo user agent), else `api`.
  - Web requests: the session helpers (`getBaseUser` / `getCurrentUser`) record
    the signed-in person for the request; `source` is `web`. A request with
    nobody signed in (a customer on a shared link, a sign-in flow) is `public`.
  - No request (cron, scripts): `system`; the seed scripts (`SEED_COMPANY_ID`
    set) are `seed`; `AUDIT_SOURCE` can name another source for a script. The
    PhonePe billing webhook runs under `withAuditNote({ source: 'webhook' })`.
  - `withAuditNote({ reason, summary, correlationId })` adds a reason, a custom
    one-line summary or a correlation id to every change made inside it.
- **Why a driver-adapter wrapper and triggers rather than only a Prisma query
  extension**: a query extension sees the top-level call only. It would miss
  nested writes, batch transactions, raw SQL and anything outside Prisma, and
  it can not put the event in the very transaction of the change. The tenant
  extension (`company-scope.ts`) is unchanged and still sits above; the
  extension that writes human summary lines to `activity_logs` (`audit.ts`,
  `logActivity`) keeps working and remains the readable one-liner companion.
- **A write the context could not be resolved for is still recorded**, as the
  `System`. Resolving attribution never fails a change.

## What an event holds

`audit_events`: `company_id`, `seq` (1, 2, 3 within the company), `occurred_at`,
`actor_user_id` + `actor_name` (a snapshot: kept even if the person is renamed or
removed) + `actor_role`, `source` (`web|api|mobile|system|webhook|seed|public`),
`request_id`, `ip`, `user_agent`, `entity_type` (Prisma model, e.g. `Invoice`),
`entity_id`, `parent_type`/`parent_id` (line items point at their document, so a
document's History shows its lines), `action`
(`create|update|delete|status|restore|baseline`), `before` / `after` (the whole
row as JSON), `changed_fields`, `summary`, `correlation_id` (rows changed by one
transaction share it, or the one the operation names), `reason`, `tx_id`,
`prev_hash`, `hash`.

- `update` with `status` among the changed columns is recorded as `status`.
- An update that only moves `updated_at` (or a token refresh) is not a change
  and writes no event.
- `before`/`after` are column names as in the database (`total_amount`), shown
  to people as labels ("Total amount").
- Secrets are masked inside the database before anything is stored, with the
  fact of the change kept: `password`, access/refresh/id tokens (`accounts`),
  share and tracking tokens, invitation tokens become `"[redacted]"`; the company
  bank `account_number` keeps its last four digits (`"••••1234"`).

## What is audited

Every model in `prisma/schema.prisma` except the list below. This is enforced:
`src/lib/audit-trail/audit-pure.test.ts` fails if a model is neither in
`AUDITED` nor in `EXCLUDED` (`src/lib/audit-trail/registry.ts`), if a listed
model has no trigger in the migrations, or if the lists name a model that no
longer exists. `audit.integration.test.ts` creates, updates and deletes a row of
every audited model through the scoped client and checks exactly one correct
event each time.

Excluded, with reasons (each is also written next to the model in `registry.ts`):

| Model | Why it is not audited |
| --- | --- |
| `Session` | Sign-in sessions: short-lived credentials created on every login. Tokens, not business data, and pure noise. |
| `Verification` | One-time email/sign-in codes: short-lived secrets. |
| `IdempotencyKey` | API replay records, a cache purged on a schedule; the change it protected is audited itself. |
| `DeviceToken` | Push tokens of phones: rotating device secrets. |
| `DocumentCounter` | The last number issued per document kind. Derived: each number appears on the (audited) document that took it. |
| `ActivityLog` | The human-readable summary lines (`logActivity`). A log itself, kept as the readable companion. |
| `AuditEvent` | The audit table itself, protected by its own triggers. |

Platform-level records (`users`, `accounts`) are audited into a separate
platform chain (`company_id` empty); `user_companies` (who may open a company, at
which role) is in the company's own chain.

## Guarantees and limits

**Guaranteed** (by Postgres, for every role including the application's):

1. A change to an audited table has an event, in the same transaction.
2. `UPDATE`, `DELETE` and `TRUNCATE` on `audit_events` are refused by triggers
   created `ENABLE ALWAYS`, so they also hold under
   `session_replication_role = replica` (restores, replication tooling).
3. Events are chained per company: `hash = sha256(canonical row || prev_hash)`,
   computed by the database at insert under a per-company advisory lock. Editing
   an event, removing one from the middle, inserting one or reordering is
   detected by verification.
4. Deleting a record (payments, expenses, adjustments, invoices, credit/debit
   notes, purchase bills, vendor payments, stock movements, opening balances,
   everything else) always stores the whole row in `before`. Nothing is lost
   with a delete.

**Not guaranteed** (be clear about these):

- A database **superuser or the table owner can `ALTER TABLE ... DISABLE TRIGGER`**
  (or drop the trigger, or rewrite the table) and edit rows. The hash chain then
  proves *that* something was changed, not who: `pnpm audit:verify` reports the
  first broken event. If the attacker also **recomputes every later hash**, the
  chain is internally consistent again; only an external anchor catches that
  (below). The managed database's admin credentials are the root of trust.
- **Removing events from the end** of a chain leaves a valid shorter chain. The
  anchor file (below) catches it.
- Events written *before* the migration do not exist: each company has one
  `baseline` event ("Audit trail started...") instead of invented history.
- `INSERT` into `audit_events` is possible for anyone who can write to the
  database; a forged event is chain-consistent. The application never inserts
  directly. Run the application with a role that has no DDL rights and `INSERT`
  (not `UPDATE`/`DELETE`/`TRUNCATE`) on `audit_events` for defence in depth.
- Attribution is as good as the session: it is the signed-in account. A shared
  login is one actor.
- An administrator who sets `AUDIT_SOURCE` or edits a request header can label
  the *source* of their own API calls; the actor still comes from the session.
- The trail stores personal data (names, phones, emails, addresses in row
  snapshots; IPs and user agents). It can not be anonymised after the fact
  without breaking the chain, so account deletion (which anonymises `users`
  and `activity_logs`) leaves historical names in `audit_events`. Decide with
  your counsel whether that is acceptable; the alternative is a retention
  policy (below).

## Verifying

- **Admin UI**: Settings > Audit log > *Verify integrity* recomputes the active
  company's whole chain and lists every break.
- **CLI**: `pnpm audit:verify` (all chains), `--company <id>` (one; `""` is the
  platform chain). It reads straight from the database with its own hash code
  (`src/lib/audit-trail/hash.ts`), independent of the database's hash function,
  and exits 1 on any break.
- **Anchors** (catch truncation and a full re-hash): run
  `pnpm audit:verify --save-anchor anchors.json` on a schedule and keep the file
  somewhere the database administrator can not write (email it, a ticket, object
  storage with object lock). Later runs with `--anchor anchors.json` fail if the
  event the anchor recorded is gone or different.

## Reasons, closed books and reversals

- **Reason on destructive actions**: deleting payments, expenses, adjustments,
  invoices (and their payments/write-offs), credit/debit notes, purchase bills
  and vendor payments asks for a reason of 3+ characters. Web: the delete dialog
  requires it. API: `X-Audit-Reason` header or `?reason=` (see
  `docs/mobile-api.md`); optional by default so installed app builds keep
  working, required when the server sets `AUDIT_REASON_REQUIRED=true`. The reason
  is stored on the event with the full snapshot. Optional on edits.
- **Lock date** (Settings > Audit log): nothing dated on or before it can be
  created, edited or deleted for payments, expenses, adjustments, opening
  balances, invoices (incl. issuing, payments, write-offs), credit/debit notes,
  purchase bills, vendor payments and stock movements. The edit checks both the
  old and the new date. A company administrator may override *with a reason*,
  which is stored on the events. Moving the lock date is itself an audited
  change with its reason.
- **Reverse** (Adjustments): an explicit counter entry dated today, linked to
  the original (`reverses_id`), so a closed period is corrected going forward
  and both entries stay visible. A reversed adjustment can not be edited or
  deleted alone; one reversal per original. Payments are not reversible in this
  way: a receipt allocated to invoices is undone by deleting it with a reason
  (snapshot kept) and re-entering it.

## Using the trail

- **Record History**: every record page that has an Activity section gets a
  *Full history* button (customers, quotations, orders, dispatch, invoices,
  payments, expenses, credit/debit notes, items, partners, purchase orders and
  bills, goods receipts, vendor payments), vendors have *History* in the header
  and each adjustment row has a clock button. Field-level before to after, a
  source badge (Web, App, API, System, Public link), reasons, and the record's
  line items. Needs the right to read that kind of record.
- **Audit log**: `/settings/audit`, for company administrators (their company
  only); a platform super-admin can switch to *All companies*. Filters by record
  type, person, action, source, date range and a search (record number or id,
  person, words), pagination, CSV export (`/settings/audit/export`), integrity
  verification and the lock date.
- **API**: `GET /api/v1/audit` and `GET /api/v1/{entity}/{id}/history`.

## Performance

One extra `INSERT` per changed row, made inside Postgres (no round trip), plus
one `set_config` round trip per transaction that writes. A `createMany` of 200
rows is one statement plus 200 audit inserts and runs in tens of milliseconds
(the integration test asserts it). Writes of one company serialise on a
per-company advisory lock **taken at the first audit insert and held until the
transaction ends** so sequence numbers stay gapless and hashes chain; keep
transactions short. Two concurrent transactions that lock rows in opposite
orders after an audited write can deadlock; Postgres aborts one with a
deadlock error and the request can be retried. Row snapshots roughly double
the size of every change: plan storage accordingly (`audit_events` is indexed by
company/time, entity, parent, actor and correlation id).

## Retention

Nothing is deleted. The table is append-only for all roles by design. Rough
size: a few hundred bytes to a few KB per event. If volume demands it, archive
the oldest events *as a whole chain segment* (export, verify, store off-site),
then cut the chain with a signed checkpoint event in a migration written for the
purpose; do not delete rows ad hoc, the verifier would (correctly) report the
gap.

## Adding a model

1. Add the model in `prisma/schema.prisma` and its migration as usual.
2. In the same migration, attach the trigger:
   `SELECT audit_attach('table_name', 'ModelName');`
   - children without their own `company_id`:
     `SELECT audit_attach('lines', 'ThingLine', 'SELECT company_id FROM things WHERE id = $1', 'id', 'Thing', 'thing_id');`
   - composite key: pass the columns as the id argument (`'user_id,company_id'`)
   - secrets to mask: the 7th argument (`'password,token'`; `col~` keeps four digits)
   - housekeeping columns to ignore: the 8th argument
3. List it in `AUDITED` in `src/lib/audit-trail/registry.ts` (or in `EXCLUDED`,
   with a reason, if it must not be audited).
4. If it has a page, add it to `src/lib/audit-trail/model-map.ts` (label, link,
   read capability) so it appears nicely in the Audit log and History.
5. Run the tests: the coverage test and the integration test fail until the
   model is wired.

## Rolling out

The migration is additive: two columns (`company_settings.lock_date`,
`balance_adjustments.reverses_id`), the `audit_events` table, functions and
triggers, one `baseline` event per company plus one for the platform chain. It
rewrites no existing row. Existing tables get triggers (cheap); there is no
backfill. After deploying, run `pnpm audit:verify` once and save an anchor.

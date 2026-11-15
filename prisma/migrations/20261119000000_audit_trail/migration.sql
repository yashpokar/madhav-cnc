-- AlterTable
ALTER TABLE "balance_adjustments" ADD COLUMN     "reverses_id" TEXT;

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "lock_date" DATE;

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "chain_key" TEXT NOT NULL,
    "company_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT,
    "actor_name" TEXT NOT NULL,
    "actor_role" TEXT,
    "source" TEXT NOT NULL,
    "request_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "parent_type" TEXT,
    "parent_id" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[],
    "summary" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "reason" TEXT,
    "tx_id" BIGINT,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_company_id_occurred_at_idx" ON "audit_events"("company_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_occurred_at_idx" ON "audit_events"("entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_parent_type_parent_id_occurred_at_idx" ON "audit_events"("parent_type", "parent_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_chain_key_seq_key" ON "audit_events"("chain_key", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "balance_adjustments_reverses_id_key" ON "balance_adjustments"("reverses_id");

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "balance_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Audit trail: append-only, hash-chained, written by triggers.
-- Additive: nothing existing is altered or rewritten. See docs/AUDIT.md.
-- ===========================================================================

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_action_check"
  CHECK ("action" IN ('create', 'update', 'delete', 'status', 'restore', 'baseline')),
  ADD CONSTRAINT "audit_events_source_check"
  CHECK ("source" IN ('web', 'api', 'mobile', 'system', 'webhook', 'seed', 'public'));

-- The text that is hashed for one event. The application's verifier
-- (src/lib/audit-trail/hash.ts) builds the very same string; keep them in step.
CREATE FUNCTION audit_canonical(r audit_events) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(chr(31),
    r.prev_hash,
    r.chain_key,
    r.seq::text,
    r.id,
    to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    COALESCE(r.company_id, ''),
    COALESCE(r.actor_user_id, ''),
    r.actor_name,
    COALESCE(r.actor_role, ''),
    r.source,
    COALESCE(r.request_id, ''),
    COALESCE(r.ip, ''),
    COALESCE(r.user_agent, ''),
    r.entity_type,
    r.entity_id,
    COALESCE(r.parent_type, ''),
    COALESCE(r.parent_id, ''),
    r.action,
    COALESCE(r.before::text, ''),
    COALESCE(r.after::text, ''),
    COALESCE(array_to_string(r.changed_fields, ','), ''),
    r.summary,
    r.correlation_id,
    COALESCE(r.reason, ''),
    COALESCE(r.tx_id::text, '')
  )
$$;

-- Chains a new event to the previous one of its company. The lock keeps two
-- concurrent transactions from taking the same sequence number; it is held
-- until the transaction ends, so events of one company commit in sequence order.
CREATE FUNCTION audit_events_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit_events:' || NEW.chain_key, 0));

  SELECT seq, hash INTO last_seq, last_hash
    FROM audit_events
   WHERE chain_key = NEW.chain_key
   ORDER BY seq DESC
   LIMIT 1;

  NEW.id := COALESCE(NEW.id, gen_random_uuid()::text);
  NEW.seq := COALESCE(last_seq, 0) + 1;
  NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
  NEW.occurred_at := clock_timestamp();
  NEW.tx_id := txid_current();
  NEW.hash := encode(sha256(convert_to(audit_canonical(NEW), 'UTF8')), 'hex');

  RETURN NEW;
END
$$;

CREATE TRIGGER audit_events_chain
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_chain();

-- The table is append-only for every role, the owner included: any UPDATE,
-- DELETE or TRUNCATE is refused. (Only dropping the trigger, which needs table
-- ownership and leaves a broken hash chain, gets around it.)
CREATE FUNCTION audit_events_reject() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_reject();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_reject();

ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_chain;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_update_delete;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_truncate;

-- The request context the application hands over for the current transaction
-- (actor, source, request id, ip...), as JSON in the audit.ctx setting.
CREATE FUNCTION audit_ctx() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('audit.ctx', true), '')::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;

-- Masks secrets in a row snapshot. A column listed as "col" becomes
-- "[redacted]"; "col~" keeps its last four characters ("••••1234").
CREATE FUNCTION audit_redact(p_row jsonb, p_secrets text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text;
  col text;
BEGIN
  IF p_row IS NULL OR p_secrets IS NULL THEN RETURN p_row; END IF;

  FOREACH s IN ARRAY p_secrets LOOP
    col := rtrim(s, '~');

    IF s <> '' AND p_row ? col AND jsonb_typeof(p_row -> col) <> 'null' THEN
      p_row := jsonb_set(
        p_row,
        ARRAY[col],
        to_jsonb(CASE WHEN right(s, 1) = '~' THEN '••••' || right(p_row ->> col, 4) ELSE '[redacted]' END)
      );
    END IF;
  END LOOP;

  RETURN p_row;
END
$$;

-- One event per changed row, written in the SAME transaction as the change,
-- so there is no change without an event and no event without a change.
-- Arguments: model, company rule (self | col | none | SQL with $1 = parent id),
-- id columns, parent model, parent column, secret columns, ignored columns.
CREATE FUNCTION audit_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_model text := TG_ARGV[0];
  v_rule text := TG_ARGV[1];
  v_id_cols text[] := string_to_array(TG_ARGV[2], ',');
  v_parent_model text := NULLIF(TG_ARGV[3], '');
  v_parent_col text := NULLIF(TG_ARGV[4], '');
  v_secrets text[] := string_to_array(COALESCE(TG_ARGV[5], ''), ',');
  v_noise text[] := string_to_array(COALESCE(TG_ARGV[6], ''), ',');
  v_ctx jsonb := audit_ctx();
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
  v_company text;
  v_entity_id text;
  v_parent_id text;
  v_source text;
  v_action text;
  v_name text;
  v_summary text;
  v_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_row := v_new;
    v_action := 'create';
    SELECT COALESCE(array_agg(e.key ORDER BY e.key), '{}') INTO v_changed
      FROM jsonb_each(v_new) e WHERE e.value <> 'null'::jsonb;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_row := v_old;
    v_action := 'delete';
    SELECT COALESCE(array_agg(e.key ORDER BY e.key), '{}') INTO v_changed
      FROM jsonb_each(v_old) e WHERE e.value <> 'null'::jsonb;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;

    SELECT COALESCE(array_agg(e.key ORDER BY e.key), '{}') INTO v_changed
      FROM jsonb_each(v_new) e
     WHERE e.value IS DISTINCT FROM (v_old -> e.key)
       AND e.key <> 'updated_at'
       AND NOT (e.key = ANY (v_noise));

    -- Only housekeeping columns moved (updated_at, token refreshes): not a change.
    IF COALESCE(array_length(v_changed, 1), 0) = 0 THEN
      RETURN NULL;
    END IF;

    v_action := CASE WHEN 'status' = ANY (v_changed) THEN 'status' ELSE 'update' END;
  END IF;

  SELECT string_agg(v_row ->> t.c, ':' ORDER BY t.ord) INTO v_entity_id
    FROM unnest(v_id_cols) WITH ORDINALITY AS t(c, ord);

  IF v_parent_col IS NOT NULL THEN
    v_parent_id := v_row ->> v_parent_col;
  END IF;

  IF v_rule = 'self' THEN
    v_company := v_row ->> 'id';
  ELSIF v_rule = 'col' THEN
    v_company := v_row ->> 'company_id';
  ELSIF v_rule = 'none' THEN
    v_company := NULL;
  ELSE
    IF v_parent_id IS NOT NULL THEN
      EXECUTE v_rule INTO v_company USING v_parent_id;

      -- The parent may be gone already (a cascading delete): ask its own trail.
      IF v_company IS NULL THEN
        SELECT a.company_id INTO v_company
          FROM audit_events a
         WHERE a.entity_type = v_parent_model
           AND a.entity_id = v_parent_id
           AND a.company_id IS NOT NULL
         ORDER BY a.occurred_at DESC
         LIMIT 1;
      END IF;
    END IF;
  END IF;

  v_company := NULLIF(v_company, '');

  IF v_company IS NULL AND v_rule <> 'none' THEN
    v_company := NULLIF(v_ctx ->> 'company_id', '');
  END IF;

  v_source := COALESCE(NULLIF(v_ctx ->> 'source', ''), 'system');

  IF v_ctx ->> 'action' IN ('restore') AND TG_OP <> 'DELETE' THEN
    v_action := v_ctx ->> 'action';
  END IF;

  v_name := COALESCE(v_row ->> 'number', v_row ->> 'name', v_row ->> 'company_name', v_row ->> 'code', v_row ->> 'title');
  v_label := lower(regexp_replace(v_model, '([a-z])([A-Z])', '\1 \2', 'g'));
  v_summary := COALESCE(
    NULLIF(v_ctx ->> 'summary', ''),
    (CASE TG_OP WHEN 'INSERT' THEN 'Created ' WHEN 'DELETE' THEN 'Deleted ' ELSE 'Updated ' END) || v_label
      || CASE WHEN v_name IS NOT NULL THEN ' "' || left(v_name, 80) || '"' ELSE '' END
      || CASE WHEN TG_OP = 'UPDATE' THEN ' (' || array_to_string(v_changed, ', ') || ')' ELSE '' END
  );

  INSERT INTO audit_events (
    chain_key, company_id, actor_user_id, actor_name, actor_role, source, request_id, ip, user_agent,
    entity_type, entity_id, parent_type, parent_id, action, before, after, changed_fields, summary,
    correlation_id, reason
  ) VALUES (
    COALESCE(v_company, ''),
    v_company,
    NULLIF(v_ctx ->> 'actor_user_id', ''),
    COALESCE(
      NULLIF(v_ctx ->> 'actor_name', ''),
      CASE v_source
        WHEN 'system' THEN 'System'
        WHEN 'seed' THEN 'Seed script'
        WHEN 'public' THEN 'Visitor (not signed in)'
        WHEN 'webhook' THEN 'Webhook'
        ELSE 'Unknown'
      END
    ),
    NULLIF(v_ctx ->> 'actor_role', ''),
    v_source,
    NULLIF(v_ctx ->> 'request_id', ''),
    NULLIF(v_ctx ->> 'ip', ''),
    NULLIF(v_ctx ->> 'user_agent', ''),
    v_model,
    v_entity_id,
    CASE WHEN v_parent_id IS NOT NULL THEN v_parent_model END,
    v_parent_id,
    v_action,
    audit_redact(v_old, v_secrets),
    audit_redact(v_new, v_secrets),
    v_changed,
    v_summary,
    COALESCE(NULLIF(v_ctx ->> 'correlation_id', ''), 'tx:' || txid_current()::text),
    NULLIF(v_ctx ->> 'reason', '')
  );

  RETURN NULL;
END
$$;

-- Puts the capture trigger on one table. ENABLE ALWAYS: it fires even under
-- session_replication_role = replica (restores, replication tooling).
-- Adding a table later is one call to this function in a new migration.
CREATE FUNCTION audit_attach(
  p_table text,
  p_model text,
  p_rule text DEFAULT 'col',
  p_id_cols text DEFAULT 'id',
  p_parent_model text DEFAULT '',
  p_parent_col text DEFAULT '',
  p_secrets text DEFAULT '',
  p_noise text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_capture ON %I', p_table);
  EXECUTE format(
    'CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_capture(%L, %L, %L, %L, %L, %L, %L)',
    p_table, p_model, p_rule, p_id_cols, p_parent_model, p_parent_col, p_secrets, p_noise
  );
  EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER audit_capture', p_table);
END
$$;

-- Business tables that carry their own company_id.
SELECT audit_attach('partners', 'Partner');
SELECT audit_attach('customers', 'Customer');
SELECT audit_attach('materials', 'Material');
SELECT audit_attach('items', 'Item');
SELECT audit_attach('quotations', 'Quotation');
SELECT audit_attach('orders', 'Order', 'col', 'id', '', '', 'tracking_token');
SELECT audit_attach('production_stages', 'ProductionStage');
SELECT audit_attach('dispatches', 'Dispatch');
SELECT audit_attach('invoices', 'Invoice', 'col', 'id', '', '', 'share_token');
SELECT audit_attach('payments', 'Payment');
SELECT audit_attach('payment_channels', 'PaymentChannel');
SELECT audit_attach('expense_categories', 'ExpenseCategory');
SELECT audit_attach('expenses', 'Expense');
SELECT audit_attach('credit_debit_notes', 'CreditDebitNote');
SELECT audit_attach('vendors', 'Vendor');
SELECT audit_attach('user_companies', 'UserCompany', 'col', 'user_id,company_id');
SELECT audit_attach('purchase_orders', 'PurchaseOrder');
SELECT audit_attach('purchase_bills', 'PurchaseBill');
SELECT audit_attach('goods_receipts', 'GoodsReceipt');
SELECT audit_attach('stock_movements', 'StockMovement');
SELECT audit_attach('vendor_payments', 'VendorPayment');
SELECT audit_attach('channel_opening_balances', 'ChannelOpeningBalance');
SELECT audit_attach('balance_adjustments', 'BalanceAdjustment');
SELECT audit_attach('invitations', 'Invitation', 'col', 'id', '', '', 'token');
SELECT audit_attach('uploads', 'Upload');
SELECT audit_attach('company_subscriptions', 'CompanySubscription');
SELECT audit_attach('billing_payments', 'BillingPayment');

-- A company is its own company; the bank account number is masked to its last four.
SELECT audit_attach('company_settings', 'CompanySetting', 'self', 'id', '', '', 'account_number~');

-- People and sign-in methods are platform-wide, not company data: they go in the
-- platform chain. A password change is recorded, never its value.
SELECT audit_attach('users', 'User', 'none');
SELECT audit_attach(
  'accounts', 'Account', 'none', 'id', '', '',
  'password,access_token,refresh_token,id_token',
  'access_token,refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope'
);

-- Line items and other child rows: filed under their document's company, and
-- shown in their document's history through parent_type / parent_id.
SELECT audit_attach('quotation_lines', 'QuotationLine', 'SELECT company_id FROM quotations WHERE id = $1', 'id', 'Quotation', 'quotation_id');
SELECT audit_attach('quotation_attachments', 'QuotationAttachment', 'SELECT company_id FROM quotations WHERE id = $1', 'id', 'Quotation', 'quotation_id');
SELECT audit_attach('quotation_shares', 'QuotationShare', 'SELECT company_id FROM quotations WHERE id = $1', 'id', 'Quotation', 'quotation_id', 'token');
SELECT audit_attach('quotation_comments', 'QuotationComment', 'SELECT company_id FROM quotations WHERE id = $1', 'id', 'Quotation', 'quotation_id');
SELECT audit_attach(
  'quotation_share_responses', 'QuotationShareResponse',
  'SELECT q.company_id FROM quotation_shares s JOIN quotations q ON q.id = s.quotation_id WHERE s.id = $1',
  'id', 'QuotationShare', 'share_id'
);
SELECT audit_attach('order_lines', 'OrderLine', 'SELECT company_id FROM orders WHERE id = $1', 'id', 'Order', 'order_id');
SELECT audit_attach('production_tasks', 'ProductionTask', 'SELECT company_id FROM orders WHERE id = $1', 'id', 'Order', 'order_id');
SELECT audit_attach('dispatch_lines', 'DispatchLine', 'SELECT company_id FROM dispatches WHERE id = $1', 'id', 'Dispatch', 'dispatch_id');
SELECT audit_attach('invoice_lines', 'InvoiceLine', 'SELECT company_id FROM invoices WHERE id = $1', 'id', 'Invoice', 'invoice_id');
SELECT audit_attach('invoice_write_offs', 'InvoiceWriteOff', 'SELECT company_id FROM invoices WHERE id = $1', 'id', 'Invoice', 'invoice_id');
SELECT audit_attach('payment_allocations', 'PaymentAllocation', 'SELECT company_id FROM payments WHERE id = $1', 'id', 'Payment', 'payment_id');
SELECT audit_attach('credit_debit_note_lines', 'CreditDebitNoteLine', 'SELECT company_id FROM credit_debit_notes WHERE id = $1', 'id', 'CreditDebitNote', 'note_id');
SELECT audit_attach('purchase_order_lines', 'PurchaseOrderLine', 'SELECT company_id FROM purchase_orders WHERE id = $1', 'id', 'PurchaseOrder', 'po_id');
SELECT audit_attach('purchase_bill_lines', 'PurchaseBillLine', 'SELECT company_id FROM purchase_bills WHERE id = $1', 'id', 'PurchaseBill', 'bill_id');
SELECT audit_attach('goods_receipt_lines', 'GoodsReceiptLine', 'SELECT company_id FROM goods_receipts WHERE id = $1', 'id', 'GoodsReceipt', 'receipt_id');
SELECT audit_attach('vendor_payment_allocations', 'VendorPaymentAllocation', 'SELECT company_id FROM vendor_payments WHERE id = $1', 'id', 'VendorPayment', 'vendor_payment_id');

-- Existing data has no history: say so once per company, instead of inventing it.
INSERT INTO audit_events (
  chain_key, company_id, actor_name, source, entity_type, entity_id, action,
  changed_fields, summary, correlation_id
)
SELECT
  c.id, c.id, 'System', 'system', 'CompanySetting', c.id, 'baseline', '{}',
  'Audit trail started. Records that existed before this point were imported without history.',
  'baseline'
FROM company_settings c;

INSERT INTO audit_events (
  chain_key, company_id, actor_name, source, entity_type, entity_id, action,
  changed_fields, summary, correlation_id
)
VALUES (
  '', NULL, 'System', 'system', 'Platform', 'platform', 'baseline', '{}',
  'Audit trail started. Records that existed before this point were imported without history.',
  'baseline'
);

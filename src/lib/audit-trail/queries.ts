import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type { Json } from '@/lib/audit-trail/diff'
import { redactSnapshot } from '@/lib/audit-trail/diff'
import { verifyRows, START_STATE, type ChainBreak, type ChainRow, type ChainState } from '@/lib/audit-trail/hash'

/**
 * Reads of the audit trail. These are raw SQL on purpose and every one takes an
 * explicit company: the tenant extension filters model queries, not raw SQL, so
 * isolation here is `company_id = <the caller's company>` in each statement
 * (tests/audit-integration proves company B reads none of company A's events).
 * `companyId: null` means every company, for platform super-admins only: the
 * caller must have checked that.
 */

export type AuditEventView = {
  id: string
  seq: string
  occurredAt: Date
  companyId: string | null
  actorUserId: string | null
  actorName: string
  actorRole: string | null
  source: string
  requestId: string | null
  ip: string | null
  userAgent: string | null
  entityType: string
  entityId: string
  parentType: string | null
  parentId: string | null
  action: string
  before: Json | null
  after: Json | null
  changedFields: string[]
  summary: string
  correlationId: string
  reason: string | null
}

export type AuditFilters = {
  entityType?: string
  entityId?: string
  actorUserId?: string
  action?: string
  source?: string
  /** Inclusive, ISO date (YYYY-MM-DD). */
  from?: string
  to?: string
  /** Free text: a record number or id, a person, or words from the summary. */
  q?: string
}

type Row = Omit<AuditEventView, 'seq' | 'before' | 'after'> & {
  seq: string
  before: Json | null
  after: Json | null
}

const COLUMNS = Prisma.sql`
  id, seq::text AS seq, occurred_at AS "occurredAt", company_id AS "companyId",
  actor_user_id AS "actorUserId", actor_name AS "actorName", actor_role AS "actorRole",
  source, request_id AS "requestId", ip, user_agent AS "userAgent",
  entity_type AS "entityType", entity_id AS "entityId",
  parent_type AS "parentType", parent_id AS "parentId", action,
  before, after, changed_fields AS "changedFields", summary,
  correlation_id AS "correlationId", reason`

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function conditions(companyId: string | null, filters: AuditFilters, beforeSeq: bigint | null = null) {
  const where: Prisma.Sql[] = []

  if (beforeSeq !== null) where.push(Prisma.sql`seq < ${beforeSeq}`)

  if (companyId !== null) where.push(Prisma.sql`company_id = ${companyId}`)

  if (filters.entityType) where.push(Prisma.sql`entity_type = ${filters.entityType}`)
  if (filters.entityId) where.push(Prisma.sql`entity_id = ${filters.entityId}`)
  if (filters.actorUserId) where.push(Prisma.sql`actor_user_id = ${filters.actorUserId}`)
  if (filters.action) where.push(Prisma.sql`action = ${filters.action}`)
  if (filters.source) where.push(Prisma.sql`source = ${filters.source}`)

  if (filters.from && DATE_ONLY.test(filters.from)) {
    where.push(Prisma.sql`occurred_at >= ${`${filters.from}T00:00:00Z`}::timestamptz`)
  }

  if (filters.to && DATE_ONLY.test(filters.to)) {
    where.push(Prisma.sql`occurred_at < (${`${filters.to}T00:00:00Z`}::timestamptz + interval '1 day')`)
  }

  const q = filters.q?.trim()

  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`

    where.push(Prisma.sql`(
      entity_id = ${q} OR parent_id = ${q} OR correlation_id = ${q} OR request_id = ${q}
      OR summary ILIKE ${like} OR actor_name ILIKE ${like}
      OR after ->> 'number' ILIKE ${like} OR before ->> 'number' ILIKE ${like}
      OR after ->> 'name' ILIKE ${like} OR before ->> 'name' ILIKE ${like}
      OR after ->> 'code' ILIKE ${like} OR before ->> 'code' ILIKE ${like}
    )`)
  }

  return where.length > 0 ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty
}

function view(row: Row): AuditEventView {
  return {
    ...row,
    occurredAt: new Date(row.occurredAt),
    before: redactSnapshot(row.entityType, row.before) as Json | null,
    after: redactSnapshot(row.entityType, row.after) as Json | null,
  }
}

export async function listAuditEvents(
  companyId: string | null,
  filters: AuditFilters,
  page: { page: number; size: number },
): Promise<{ rows: AuditEventView[]; total: number }> {
  const where = conditions(companyId, filters)
  const [count, rows] = await Promise.all([
    prisma.$queryRaw<{ n: string }[]>(Prisma.sql`SELECT count(*)::text AS n FROM audit_events ${where}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT ${COLUMNS} FROM audit_events ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${page.size} OFFSET ${(page.page - 1) * page.size}`),
  ])

  return { rows: rows.map(view), total: Number(count[0]?.n ?? 0) }
}

/** Distinct people and entity types that appear in a company's trail (filter menus). */
export async function auditFacets(companyId: string | null) {
  const where = companyId !== null ? Prisma.sql`WHERE company_id = ${companyId}` : Prisma.empty
  const [people, entities] = await Promise.all([
    prisma.$queryRaw<{ id: string | null; name: string }[]>(Prisma.sql`
      SELECT actor_user_id AS id, max(actor_name) AS name FROM audit_events ${where}
      GROUP BY actor_user_id ORDER BY max(actor_name)`),
    prisma.$queryRaw<{ type: string }[]>(Prisma.sql`
      SELECT DISTINCT entity_type AS type FROM audit_events ${where} ORDER BY entity_type`),
  ])

  return { people, entityTypes: entities.map((e) => e.type) }
}

/** Every event of one record, including its line items (children), newest first. */
export async function entityHistory(
  companyId: string,
  entityType: string,
  entityId: string,
  options: { limit?: number; before?: bigint | null } = {},
): Promise<AuditEventView[]> {
  const { limit = 200, before = null } = options
  const cursor = before === null ? Prisma.empty : Prisma.sql`AND seq < ${before}`

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT ${COLUMNS} FROM audit_events
     WHERE company_id = ${companyId}
       AND ((entity_type = ${entityType} AND entity_id = ${entityId})
         OR (parent_type = ${entityType} AND parent_id = ${entityId}))
       ${cursor}
     ORDER BY audit_events.seq DESC
     LIMIT ${limit}`)

  return rows.map(view)
}

/**
 * One keyset page of a company's trail, newest first, for the mobile API.
 * `before` is the sequence number of the last event already seen.
 */
export async function listAuditEventsAfter(
  companyId: string,
  filters: AuditFilters,
  after: bigint | null,
  take: number,
): Promise<AuditEventView[]> {
  const where = conditions(companyId, filters, after)
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT ${COLUMNS} FROM audit_events ${where}
    ORDER BY audit_events.seq DESC
    LIMIT ${take}`)

  return rows.map(view)
}

/** A page of events for the CSV export (kept small so the export streams). */
export async function exportAuditPage(
  companyId: string | null,
  filters: AuditFilters,
  offset: number,
  take: number,
): Promise<AuditEventView[]> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT ${COLUMNS} FROM audit_events ${conditions(companyId, filters)}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ${take} OFFSET ${offset}`)

  return rows.map(view)
}

const CHAIN_COLUMNS = Prisma.sql`
  id, seq::text AS seq, chain_key AS "chainKey",
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",
  company_id AS "companyId", actor_user_id AS "actorUserId", actor_name AS "actorName",
  actor_role AS "actorRole", source, request_id AS "requestId", ip, user_agent AS "userAgent",
  entity_type AS "entityType", entity_id AS "entityId", parent_type AS "parentType",
  parent_id AS "parentId", action, before::text AS before, after::text AS after,
  COALESCE(array_to_string(changed_fields, ','), '') AS "changedFields", summary,
  correlation_id AS "correlationId", reason, tx_id::text AS "txId",
  prev_hash AS "prevHash", hash`

export type ChainReport = {
  chainKey: string
  ok: boolean
  checked: number
  head: { seq: string; hash: string } | null
  breaks: ChainBreak[]
}

const PAGE = 2000

/** Recomputes every hash of one company's chain and reports each break. */
export async function verifyChain(chainKey: string): Promise<ChainReport> {
  let state: ChainState = START_STATE
  let cursor = BigInt(0)
  let checked = 0
  let head: ChainReport['head'] = null
  const breaks: ChainBreak[] = []

  for (;;) {
    const rows = await prisma.$queryRaw<ChainRow[]>(Prisma.sql`
      SELECT ${CHAIN_COLUMNS} FROM audit_events
       WHERE chain_key = ${chainKey} AND seq > ${cursor}
       ORDER BY audit_events.seq LIMIT ${PAGE}`)

    if (rows.length === 0) break

    const result = verifyRows(rows, state)

    breaks.push(...result.breaks)
    state = result.state
    checked += rows.length

    const last = rows[rows.length - 1]

    head = { seq: last.seq, hash: last.hash }
    cursor = BigInt(last.seq)
  }

  return { chainKey, ok: breaks.length === 0, checked, head, breaks }
}

/** How many events a company's trail holds, and since when. */
export async function auditTotals(companyId: string | null) {
  const where = companyId !== null ? Prisma.sql`WHERE company_id = ${companyId}` : Prisma.empty
  const rows = await prisma.$queryRaw<{ n: string; since: Date | null }[]>(
    Prisma.sql`SELECT count(*)::text AS n, min(occurred_at) AS since FROM audit_events ${where}`,
  )

  return { count: Number(rows[0]?.n ?? 0), since: rows[0]?.since ? new Date(rows[0].since) : null }
}

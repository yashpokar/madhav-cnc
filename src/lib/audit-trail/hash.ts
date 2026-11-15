import { createHash } from 'node:crypto'

/**
 * The hash chain of the audit trail. The database computes each event's hash
 * when it is inserted (audit_events_chain trigger); this file recomputes it
 * independently, from the stored columns, so the chain can be verified without
 * trusting the database's own function.
 *
 * The text hashed MUST match audit_canonical() in the migration, field for field.
 */

export const GENESIS_HASH = '0'.repeat(64)
const SEPARATOR = String.fromCharCode(31)

/** One event as selected by loadChainPage (all text, exactly as stored). */
export type ChainRow = {
  id: string
  seq: string
  chainKey: string
  /** UTC, microseconds: YYYY-MM-DDTHH:MI:SS.UUUUUUZ */
  occurredAt: string
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
  /** `before::text` as Postgres prints the jsonb. */
  before: string | null
  after: string | null
  /** changed_fields joined with ','. */
  changedFields: string
  summary: string
  correlationId: string
  reason: string | null
  txId: string | null
  prevHash: string
  hash: string
}

export function canonicalText(row: ChainRow): string {
  return [
    row.prevHash,
    row.chainKey,
    row.seq,
    row.id,
    row.occurredAt,
    row.companyId ?? '',
    row.actorUserId ?? '',
    row.actorName,
    row.actorRole ?? '',
    row.source,
    row.requestId ?? '',
    row.ip ?? '',
    row.userAgent ?? '',
    row.entityType,
    row.entityId,
    row.parentType ?? '',
    row.parentId ?? '',
    row.action,
    row.before ?? '',
    row.after ?? '',
    row.changedFields,
    row.summary,
    row.correlationId,
    row.reason ?? '',
    row.txId ?? '',
  ].join(SEPARATOR)
}

export const computeHash = (row: ChainRow) =>
  createHash('sha256').update(canonicalText(row), 'utf8').digest('hex')

export type ChainBreak = {
  seq: string
  id: string
  kind:
    | 'hash_mismatch' // the row's content no longer matches its hash: edited
    | 'prev_mismatch' // does not point at the previous row's hash: a row was removed, inserted or reordered
    | 'seq_gap' // a sequence number is missing: a row was deleted
    | 'bad_start' // the chain does not begin at 1 with the genesis hash
  message: string
}

export type ChainState = { nextSeq: bigint; lastHash: string }

export const START_STATE: ChainState = { nextSeq: BigInt(1), lastHash: GENESIS_HASH }

/**
 * Walks rows in sequence order and reports every break. Pure: pass pages
 * one after another, feeding `state` forward. Verification continues after a
 * break (resynchronising on the row actually seen) so one tampered row does
 * not hide a second one.
 */
export function verifyRows(
  rows: readonly ChainRow[],
  state: ChainState = START_STATE,
): { breaks: ChainBreak[]; state: ChainState } {
  const breaks: ChainBreak[] = []
  let { nextSeq, lastHash } = state

  for (const row of rows) {
    const seq = BigInt(row.seq)

    if (seq !== nextSeq) {
      breaks.push({
        seq: row.seq,
        id: row.id,
        kind: nextSeq === BigInt(1) && lastHash === GENESIS_HASH ? 'bad_start' : 'seq_gap',
        message: `Expected event ${nextSeq} but found ${seq}: ${seq > nextSeq ? 'events are missing' : 'events are out of order'}.`,
      })
    }

    if (row.prevHash !== lastHash) {
      breaks.push({
        seq: row.seq,
        id: row.id,
        kind: 'prev_mismatch',
        message: `Event ${seq} does not continue from the event before it.`,
      })
    }

    if (computeHash(row) !== row.hash) {
      breaks.push({
        seq: row.seq,
        id: row.id,
        kind: 'hash_mismatch',
        message: `Event ${seq} was changed after it was written (its content does not match its hash).`,
      })
    }

    nextSeq = seq + BigInt(1)
    lastHash = row.hash
  }

  return { breaks, state: { nextSeq, lastHash } }
}

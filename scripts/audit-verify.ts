// Verifies the audit trail's hash chains straight from the database, without
// the application: a stand-alone check that recomputes every event's hash and
// reports each break. Exit code 1 when anything is wrong.
//
//   pnpm audit:verify                       every company chain
//   pnpm audit:verify --company <id>        one company ("" is the platform chain)
//   pnpm audit:verify --save-anchor f.json  also write each chain's latest seq + hash
//   pnpm audit:verify --anchor f.json       also check each chain still contains the
//                                           event the anchor recorded (catches events
//                                           removed from the END of a chain, which the
//                                           chain alone can not show)
//
// Store anchors somewhere the database's administrator can not write (an email,
// a ticket, object storage with object lock): see docs/AUDIT.md.
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { Pool } from 'pg'
import { verifyRows, START_STATE, type ChainRow, type ChainState } from '../src/lib/audit-trail/hash'

const COLUMNS = `
  id, seq::text AS seq, chain_key AS "chainKey",
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",
  company_id AS "companyId", actor_user_id AS "actorUserId", actor_name AS "actorName",
  actor_role AS "actorRole", source, request_id AS "requestId", ip, user_agent AS "userAgent",
  entity_type AS "entityType", entity_id AS "entityId", parent_type AS "parentType",
  parent_id AS "parentId", action, before::text AS before, after::text AS after,
  COALESCE(array_to_string(changed_fields, ','), '') AS "changedFields", summary,
  correlation_id AS "correlationId", reason, tx_id::text AS "txId",
  prev_hash AS "prevHash", hash`

const PAGE = 5000

type Anchor = Record<string, { seq: string; hash: string }>

function arg(name: string) {
  const index = process.argv.indexOf(name)

  return index >= 0 ? (process.argv[index + 1] ?? '') : undefined
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL

  if (!url) throw new Error('DATABASE_URL is not set')

  const pool = new Pool({ connectionString: url })
  const only = arg('--company')
  const anchorPath = arg('--anchor')
  const savePath = arg('--save-anchor')
  const anchors: Anchor = anchorPath ? JSON.parse(readFileSync(anchorPath, 'utf8')) : {}
  const heads: Anchor = {}
  let broken = 0

  try {
    const keys = only !== undefined
      ? [only]
      : (await pool.query<{ chain_key: string }>('SELECT DISTINCT chain_key FROM audit_events ORDER BY chain_key')).rows.map(
          (row) => row.chain_key,
        )

    for (const key of keys) {
      let state: ChainState = START_STATE
      let cursor = '0'
      let checked = 0
      let head: { seq: string; hash: string } | null = null
      const problems: string[] = []
      const seen = new Map<string, string>()

      for (;;) {
        const { rows } = await pool.query<ChainRow>(
          `SELECT ${COLUMNS} FROM audit_events WHERE chain_key = $1 AND seq > $2::bigint ORDER BY audit_events.seq LIMIT ${PAGE}`,
          [key, cursor],
        )

        if (rows.length === 0) break

        const result = verifyRows(rows, state)

        for (const item of result.breaks) problems.push(`#${item.seq} ${item.kind}: ${item.message}`)

        state = result.state
        checked += rows.length
        for (const row of rows) seen.set(row.seq, row.hash)
        head = { seq: rows[rows.length - 1].seq, hash: rows[rows.length - 1].hash }
        cursor = head.seq
      }

      const anchored = anchors[key]

      if (anchored) {
        // Memory stays small: only the anchored event matters, so look it up directly.
        const { rows } = await pool.query<{ hash: string }>(
          'SELECT hash FROM audit_events WHERE chain_key = $1 AND seq = $2::bigint',
          [key, anchored.seq],
        )

        if (rows[0]?.hash !== anchored.hash) {
          problems.push(`anchor: event #${anchored.seq} is missing or differs from the recorded hash`)
        }
      }

      if (head) heads[key] = head

      const label = key === '' ? '(platform)' : key
      const status = problems.length === 0 ? 'OK' : 'BROKEN'

      console.log(`${status.padEnd(6)} ${label}  ${checked} events${head ? `  head #${head.seq} ${head.hash.slice(0, 16)}…` : ''}`)

      for (const problem of problems.slice(0, 20)) console.log(`         ${problem}`)

      if (problems.length > 20) console.log(`         … and ${problems.length - 20} more`)

      if (problems.length > 0) broken += 1
    }
  } finally {
    await pool.end()
  }

  if (savePath) {
    writeFileSync(savePath, `${JSON.stringify(heads, null, 2)}\n`)
    console.log(`Wrote anchors for ${Object.keys(heads).length} chains to ${savePath}`)
  }

  if (broken > 0) {
    console.error(`${broken} chain(s) failed verification`)
    process.exit(1)
  }

  console.log('All chains intact')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

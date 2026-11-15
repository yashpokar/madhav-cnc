import { NextResponse } from 'next/server'
import { getActiveCompanyId } from '@/lib/active-company'
import { toCsv, type CsvCell } from '@/lib/csv'
import { exportAuditPage, type AuditFilters } from '@/lib/audit-trail/queries'
import { can } from '@/lib/permissions'
import { getCurrentUser } from '@/lib/session'

const PAGE = 1000
/** A hard ceiling so one export can not hold a worker for minutes. */
const MAX_ROWS = 50_000

const HEADERS = [
  'Entry',
  'When (UTC)',
  'Company',
  'Person',
  'Role',
  'From',
  'Request',
  'IP',
  'Record',
  'Record id',
  'Belongs to',
  'Action',
  'Changed fields',
  'Summary',
  'Reason',
  'Group',
  'Before',
  'After',
]

/**
 * The audit log as CSV, honouring the page's filters. Company administrators
 * get their own company; a platform super-admin may add ?all=1 for every one.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()

  if (!user || !can(user.role, 'settings:update')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const companyId = await getActiveCompanyId()
  const url = new URL(request.url)
  const all = user.isSuperAdmin && url.searchParams.get('all') === '1'

  if (!companyId && !all) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const get = (key: string) => url.searchParams.get(key) || undefined
  const filters: AuditFilters = {
    entityType: get('entity'),
    actorUserId: get('who'),
    action: get('action'),
    source: get('source'),
    from: get('from'),
    to: get('to'),
    q: get('q'),
  }

  const rows: CsvCell[][] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await exportAuditPage(all ? null : companyId, filters, offset, PAGE)

    for (const e of page) {
      rows.push([
        e.seq,
        e.occurredAt.toISOString().replace('T', ' ').slice(0, 19),
        e.companyId,
        e.actorName,
        e.actorRole,
        e.source,
        e.requestId,
        e.ip,
        e.entityType,
        e.entityId,
        e.parentType ? `${e.parentType} ${e.parentId}` : null,
        e.action,
        e.changedFields.join('; '),
        e.summary,
        e.reason,
        e.correlationId,
        e.before ? JSON.stringify(e.before) : null,
        e.after ? JSON.stringify(e.after) : null,
      ])
    }

    if (page.length < PAGE) break
  }

  return new NextResponse(toCsv(HEADERS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

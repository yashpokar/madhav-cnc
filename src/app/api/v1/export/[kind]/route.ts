import { ApiError } from '@/lib/api/errors'
import { apiRoute } from '@/lib/api/handler'
import { exportQuery } from '@/lib/api/schemas/account'
import { requireApiCapability } from '@/lib/api/auth'
import { toCsv } from '@/lib/csv'
import { EXPORT_RESOURCE, buildSheet } from '@/lib/services/export'

/**
 * A CSV of one list, the same file the web "Export" button downloads (UTF-8
 * with a BOM). `kind`: customers, quotations, orders, invoices, payments,
 * expenses, purchase-bills, purchase-orders, vendor-payments, stock. Needs the
 * read capability of that kind; `q` and `status` filter like the list.
 */
export const GET = apiRoute({ auth: 'company', query: exportQuery }, async ({ params, query, user }) => {
  const resource = EXPORT_RESOURCE[params.kind]

  if (!resource) throw new ApiError('NOT_FOUND', 'Unknown export.')

  requireApiCapability(user, `${resource}:read`)

  const sheet = await buildSheet(params.kind, query.q || undefined, query.status ?? null)

  if (!sheet) throw new ApiError('NOT_FOUND', 'Unknown export.')

  const date = new Date().toISOString().slice(0, 10)

  return new Response(toCsv(sheet.headers, sheet.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${params.kind}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})

import { apiRoute } from '@/lib/api/handler'
import { listExpenseCategories } from '@/lib/queries/accounting'

export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async () => {
  const rows = await listExpenseCategories(true)

  return rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sortOrder }))
})

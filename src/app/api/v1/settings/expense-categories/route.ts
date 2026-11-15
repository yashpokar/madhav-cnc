import { apiRoute, reply } from '@/lib/api/handler'
import { listExpenseCategories } from '@/lib/queries/accounting'

/** Every expense category, inactive ones included, with how many expenses use it (to manage them). */
export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async () => {
  const rows = await listExpenseCategories(false)

  return reply(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      expenseCount: row._count.expenses,
    })),
  )
})

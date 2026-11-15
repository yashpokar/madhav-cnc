import { Link } from '@/components/catalyst/link'
import { CARD } from '@/components/dashboard-parts'
import { can } from '@/lib/permissions'
import { countLowStock } from '@/lib/queries/stock'
import type { UserRole } from '@/generated/prisma/enums'

/**
 * A small dashboard tile: how many stocked things are at or below their
 * reorder level. Shows nothing unless the person may see stock and something
 * is actually low.
 */
export async function LowStockTile({ role }: { role: UserRole }) {
  if (!can(role, 'stock:read')) return null

  const count = await countLowStock()

  if (count === 0) return null

  return (
    <Link
      href="/stock?tab=low"
      className={`${CARD} flex items-center justify-between gap-3 px-4 py-3 text-sm/6 transition hover:bg-zinc-50 print:hidden dark:hover:bg-white/5`}
    >
      <span>
        <span className="text-xl/7 font-semibold tabular-nums text-red-600 dark:text-red-400">{count}</span>{' '}
        low on stock
      </span>
      <span className="text-zinc-500 dark:text-zinc-400">View stock</span>
    </Link>
  )
}

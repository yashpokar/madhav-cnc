import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { listBoardTasks, listStages } from '@/lib/queries/production'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ProductionBoard } from './board'

export const metadata: Metadata = {
  title: 'Production',
}

export default async function ProductionPage({
  searchParams,
}: PageProps<'/production'>) {
  const user = await requireCapability('production:read')
  const params = await searchParams

  const search = typeof params.q === 'string' ? params.q : undefined
  const showFinished = params.finished === '1'

  const [stages, tasks] = await Promise.all([
    listStages(),
    listBoardTasks({ search }),
  ])

  const canUpdate = can(user.role, 'production:update')
  const canManageStages = can(user.role, 'settings:update')
  const openTasks = tasks.filter(
    (task) => task.status !== 'DONE' && task.status !== 'SKIPPED',
  ).length

  const toggleQuery = new URLSearchParams()
  if (search) toggleQuery.set('q', search)
  if (!showFinished) toggleQuery.set('finished', '1')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Production</Heading>
          <Text>
            {openTasks} open task{openTasks === 1 ? '' : 's'} across orders in
            production
          </Text>
        </div>
        <div className="flex items-center gap-3">
          {canManageStages ? (
            <Button outline href="/production/stages">
              Stages
            </Button>
          ) : null}
          <SearchField placeholder="Search order, customer…" />
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href={
            toggleQuery.toString()
              ? `/production?${toggleQuery.toString()}`
              : '/production'
          }
          className="text-sm/6 text-zinc-500 underline decoration-zinc-950/20 hover:text-zinc-950 dark:text-zinc-400 dark:decoration-white/20 dark:hover:text-white"
        >
          {showFinished ? 'Hide completed stages' : 'Show completed stages'}
        </Link>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'Nothing in production'}
          description={
            search
              ? 'Try a different order number or customer.'
              : 'Move a confirmed order into production and its stages appear here.'
          }
        />
      ) : (
        <ProductionBoard
          stages={stages}
          tasks={tasks}
          canUpdate={canUpdate}
          hideFinished={!showFinished}
        />
      )}
    </div>
  )
}

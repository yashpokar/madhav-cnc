import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { FilterSelect } from '@/components/filter-select'
import { LocalTime } from '@/components/local-time'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type Paged } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Activity log',
}

const AREAS: Record<string, { label: string; href?: (id: string) => string }> = {
  customer: { label: 'Customer', href: (id) => `/customers/${id}` },
  quotation: { label: 'Quotation', href: (id) => `/quotations/${id}` },
  order: { label: 'Order', href: (id) => `/orders/${id}` },
  dispatch: { label: 'Challan', href: (id) => `/dispatch/${id}` },
  invoice: { label: 'Invoice', href: (id) => `/invoices/${id}` },
  payment: { label: 'Receipt', href: (id) => `/payments/${id}` },
  note: { label: 'Note', href: (id) => `/notes/${id}` },
  expense: { label: 'Expense', href: (id) => `/expenses/${id}` },
  'expense-category': { label: 'Expense category' },
  'cash-credit': { label: 'Cash credit' },
  item: { label: 'Item', href: (id) => `/items/${id}` },
  material: { label: 'Material' },
  partner: { label: 'Partner', href: (id) => `/partners/${id}` },
  stage: { label: 'Production stage' },
  company: { label: 'Company settings', href: () => '/settings/company' },
  user: { label: 'User' },
}

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || undefined

export default async function ActivityLogPage({
  searchParams,
}: PageProps<'/admin/activity'>) {
  await requireCapability('user:update')
  const params = await searchParams

  const entity = one(params.entity)
  const who = one(params.who)
  const q = one(params.q)?.trim()
  const requestedSize = Number(one(params.size))
  const size = (PAGE_SIZES as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE

  const where = {
    ...(entity ? { entityType: entity } : {}),
    ...(who ? { userName: who } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q, mode: 'insensitive' as const } },
            { userName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, people] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      distinct: ['userName'],
      select: { userName: true },
      orderBy: { userName: 'asc' },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(Math.floor(Number(one(params.page))) || 1, 1), pages)

  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * size,
    take: size,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      summary: true,
      userName: true,
      createdAt: true,
    },
  })

  const paged: Paged = { rows: [], total, page, pages, size }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Activity log</Heading>
        <Text>
          Everything anyone creates, changes or deletes, newest first. Deleted
          records stay listed here after their own pages are gone.
        </Text>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            param="entity"
            label="Area"
            allLabel="All areas"
            value={entity}
            options={Object.entries(AREAS).map(([value, { label }]) => ({ value, label }))}
          />
          <FilterSelect
            param="who"
            label="Person"
            allLabel="Everyone"
            value={who}
            options={people
              .filter((p) => p.userName)
              .map((p) => ({ value: p.userName!, label: p.userName! }))}
          />
        </div>
        <SearchField placeholder="Search what happened…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing found"
          description="No activity matches these filters yet."
        />
      ) : (
        <>
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>When</TableHeader>
                <TableHeader>Who</TableHeader>
                <TableHeader>Area</TableHeader>
                <TableHeader>What happened</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const area = AREAS[row.entityType]
                const href =
                  row.action !== 'deleted' && area?.href ? area.href(row.entityId) : null

                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      <LocalTime value={row.createdAt} withZone />
                    </TableCell>
                    <TableCell className="font-medium">{row.userName ?? 'Someone'}</TableCell>
                    <TableCell>
                      <Badge color={row.action === 'deleted' ? 'red' : 'zinc'}>
                        {area?.label ?? row.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {href ? (
                        <Link href={href} className="underline decoration-zinc-950/20 underline-offset-2">
                          {row.summary}
                        </Link>
                      ) : (
                        row.summary
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/admin/activity" />
        </>
      )}
    </div>
  )
}

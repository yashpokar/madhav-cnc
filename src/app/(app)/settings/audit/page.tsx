import type { Metadata } from 'next'
import { ArrowDownTrayIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { AuditEvent } from '@/components/audit/audit-event'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { DateRangeFilter } from '@/components/date-range-filter'
import { EmptyState } from '@/components/form-banner'
import { FilterSelect } from '@/components/filter-select'
import { LocalTime } from '@/components/local-time'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { requireCompanyId } from '@/lib/active-company'
import { AUDIT_SOURCES } from '@/lib/audit-trail/context'
import { actionLabel, entityLabel, sourceBadge } from '@/lib/audit-trail/diff'
import { AUDIT_MODELS } from '@/lib/audit-trail/model-map'
import { presentEvent } from '@/lib/audit-trail/present'
import { auditFacets, auditTotals, listAuditEvents, type AuditFilters } from '@/lib/audit-trail/queries'
import { readDateRange } from '@/lib/list-controls'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type Paged } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { IntegrityPanel } from './integrity-panel'
import { LockDateForm } from './lock-date-form'

export const metadata: Metadata = {
  title: 'Audit log',
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined

const ACTIONS = ['create', 'update', 'status', 'delete', 'restore', 'baseline']

type BadgeColor = React.ComponentProps<typeof Badge>['color']

export default async function AuditLogPage({ searchParams }: PageProps<'/settings/audit'>) {
  const user = await requireCapability('settings:update')
  const companyId = await requireCompanyId()
  const params = await searchParams

  // A platform super-admin may look across every company; company administrators never can.
  const allCompanies = user.isSuperAdmin && one(params.all) === '1'
  const scope = allCompanies ? null : companyId

  const { from, to } = readDateRange(params)
  const filters: AuditFilters = {
    entityType: one(params.entity),
    actorUserId: one(params.who),
    action: one(params.action),
    source: one(params.source),
    from,
    to,
    q: one(params.q)?.trim(),
  }
  const filtered = Object.values(filters).some(Boolean)

  const requestedSize = Number(one(params.size))
  const size = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE
  const requestedPage = Math.max(1, Math.floor(Number(one(params.page))) || 1)

  const [{ rows, total }, totals, facets, company] = await Promise.all([
    listAuditEvents(scope, filters, { page: requestedPage, size }),
    auditTotals(scope),
    auditFacets(scope),
    prisma.companySetting.findUnique({ where: { id: companyId }, select: { lockDate: true } }),
  ])

  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(requestedPage, pages)
  const paged: Paged = { rows: [], total, page, pages, size }

  const exportQuery = new URLSearchParams()
  const forExport = {
    entity: filters.entityType,
    who: filters.actorUserId,
    action: filters.action,
    source: filters.source,
    from,
    to,
    q: filters.q,
  }

  for (const [key, value] of Object.entries(forExport)) if (value) exportQuery.set(key, value)

  if (allCompanies) exportQuery.set('all', '1')

  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid gap-2">
          <Heading>Audit log</Heading>
          <Text>
            Who changed what, when and from where: every create, edit and delete, with the values before and after.
            Entries can not be edited or removed.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.isSuperAdmin ? (
            <Button outline href={allCompanies ? '/settings/audit' : '/settings/audit?all=1'}>
              {allCompanies ? 'This company only' : 'All companies'}
            </Button>
          ) : null}
          <Button outline href={`/settings/audit/export${exportQuery.size ? `?${exportQuery}` : ''}`} prefetch={false} download>
            <ArrowDownTrayIcon />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrityPanel events={totals.count} firstAt={totals.since?.toISOString() ?? null} />
        <LockDateForm current={company?.lockDate ? company.lockDate.toISOString().slice(0, 10) : null} />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search record number, id, person, words…" />
        <FilterSelect
          param="entity"
          label="Record"
          allLabel="All"
          value={filters.entityType}
          options={facets.entityTypes.map((type) => ({ value: type, label: AUDIT_MODELS[type]?.label ?? entityLabel(type) }))}
        />
        <FilterSelect
          param="who"
          label="Person"
          allLabel="Everyone"
          value={filters.actorUserId}
          options={facets.people.filter((p) => p.id).map((p) => ({ value: p.id as string, label: p.name }))}
        />
        <FilterSelect
          param="action"
          label="Action"
          allLabel="Any"
          value={filters.action}
          options={ACTIONS.map((a) => ({ value: a, label: actionLabel(a) }))}
        />
        <FilterSelect
          param="source"
          label="From"
          allLabel="Anywhere"
          value={filters.source}
          options={AUDIT_SOURCES.map((s) => ({ value: s, label: sourceBadge(s).label }))}
        />
        <DateRangeFilter defaultFrom={from} defaultTo={to} label="Date" autoSubmit />
        {filtered ? (
          <Button plain href="/settings/audit">
            Clear
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No matches"
            description="No entry fits the current search and filters."
            action={
              <Button outline href="/settings/audit">
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState title="Nothing recorded yet" description="Every change anyone makes from now on is listed here." />
        )
      ) : (
        <>
          <p className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
            {filtered ? `${total.toLocaleString('en-IN')} of ${totals.count.toLocaleString('en-IN')} events` : `${total.toLocaleString('en-IN')} events`}
          </p>
          <ul className="surface-card divide-y divide-zinc-950/5 dark:divide-white/10">
            {rows.map((row) => {
              const entry = presentEvent(row)
              const href = AUDIT_MODELS[row.entityType]?.href?.(row.entityId)
              const badge = sourceBadge(row.source)

              return (
                <li key={row.id}>
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[1rem_1fr] items-start gap-x-2 gap-y-1 px-4 py-3 select-none marker:content-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:grid-cols-[1rem_11rem_9rem_1fr] sm:gap-x-4 [&::-webkit-details-marker]:hidden">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90"
                      />
                      <span className="col-start-2 text-xs/6 text-zinc-500 tabular-nums dark:text-zinc-400 sm:col-start-auto">
                        <LocalTime value={row.occurredAt} withZone />
                      </span>
                      <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-sm/6 sm:col-start-auto">
                        <span className="truncate font-medium text-zinc-950 dark:text-white">{row.actorName}</span>
                        <Badge color={badge.color as BadgeColor}>{badge.label}</Badge>
                      </span>
                      <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-sm/6 sm:col-start-auto">
                        <Badge color={row.action === 'delete' ? 'red' : row.action === 'create' ? 'green' : 'zinc'}>
                          {entry.actionLabel}
                        </Badge>
                        <span className="font-medium">{entry.entityLabel}</span>
                        <span className="min-w-0 text-zinc-600 dark:text-zinc-400">{row.summary}</span>
                      </span>
                    </summary>
                    <div className="grid gap-3 px-4 pt-1 pb-4 sm:pl-[calc(1rem+0.5rem+0.0rem)]">
                      <div className="ml-6 grid gap-3">
                        <AuditEvent entry={entry} showEntity />
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                          {href ? (
                            <Link href={href} className="underline underline-offset-2">
                              Open {entry.entityLabel.toLowerCase()}
                            </Link>
                          ) : null}
                          <span>
                            Entry #{row.seq}
                            {row.actorRole ? ` · ${row.actorRole}` : ''}
                            {row.ip ? ` · ${row.ip}` : ''}
                          </span>
                          {row.requestId ? <span className="font-mono">request {row.requestId.slice(0, 12)}</span> : null}
                          <span className="font-mono">group {row.correlationId.slice(0, 16)}</span>
                        </p>
                      </div>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
          <Pagination paged={paged} params={params} pathname="/settings/audit" />
        </>
      )}
    </div>
  )
}

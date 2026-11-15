import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { ListSummary } from '@/components/list-summary'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { clearHref } from '@/lib/list-href'
import { sortRows } from '@/lib/table-sort'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deletePartner } from '@/lib/actions/partners'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState, FormBanner } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { listPartners } from '@/lib/queries/partners'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PartnerType } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Architects & Carpenters',
}

const TABS: { label: string; value: string; type?: PartnerType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Architects', value: 'architects', type: 'ARCHITECT' },
  { label: 'Carpenters', value: 'carpenters', type: 'CARPENTER' },
]

export default async function PartnersPage({
  searchParams,
}: PageProps<'/partners'>) {
  const user = await requireCapability('partner:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined
  const created = typeof params.created === 'string' ? params.created : undefined
  // Active partners by default; `inactive=1` is the older spelling of show=all.
  const requestedShow = typeof params.show === 'string' ? params.show : undefined
  const show =
    requestedShow === 'all' || requestedShow === 'inactive'
      ? requestedShow
      : params.inactive === '1'
        ? 'all'
        : undefined

  // Everything, to offer the cities and to count against; and the search matches.
  const [everyone, matched] = await Promise.all([
    listPartners({ includeInactive: true }),
    search ? listPartners({ search, includeInactive: true }) : null,
  ])
  const cities = [
    ...new Set(everyone.map((partner) => partner.city).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const city =
    typeof params.city === 'string' && cities.includes(params.city) ? params.city : undefined

  const visible = (partner: (typeof everyone)[number]) =>
    show === 'all' ? true : show === 'inactive' ? !partner.isActive : partner.isActive
  const total = everyone.filter(visible).length
  const filtered = Boolean(search || activeTab.type || city || show)
  const partners = sortRows(
    (matched ?? everyone).filter(
      (partner) =>
        visible(partner) &&
        (!activeTab.type || partner.type === activeTab.type) &&
        (!city || partner.city === city),
    ),
    params,
    {
      code: (partner) => partner.code,
      name: (partner) => partner.name,
      type: (partner) => (partner.type === 'ARCHITECT' ? 'Architect' : 'Carpenter'),
      phone: (partner) => partner.phone,
      city: (partner) => partner.city,
      customers: (partner) =>
        partner._count.preferredByArchitect + partner._count.preferredByCarpenter,
    },
  )

  const canCreate = can(user.role, 'partner:create')
  const canEdit = can(user.role, 'partner:update')
  const canDelete = can(user.role, 'partner:delete')

  const paged = paginate(partners, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Architects &amp; Carpenters</Heading>
          <Text>
            Referral partners. A customer can have a preferred architect and
            carpenter, and every quotation and order records who brought the job.
          </Text>
        </div>
        {canCreate ? <Button href="/partners/new">Add partner</Button> : null}
      </div>

      {created ? (
        <FormBanner tone="success">Partner {created} saved</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name, firm, phone, city…" />
        <StatusFilter
          label="Type"
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/partners"
          paramKey="tab"
          defaultValue="all"
        />
        <div className="contents">
          <FilterSelect
            param="city"
            label="City"
            allLabel="All"
            value={city}
            options={cities.map((value) => ({ value, label: value }))}
          />
          <FilterSelect
            param="show"
            label="Status"
            allLabel="Active only"
            value={show}
            options={[
              { value: 'all', label: 'Active and inactive' },
              { value: 'inactive', label: 'Inactive only' },
            ]}
          />
        </div>
      </div>

      {total > 0 ? (
        <ListSummary
          shown={partners.length}
          total={total}
          singular="partner"
          plural="partners"
          filtered={filtered}
          params={params}
          pathname="/partners"
        />
      ) : null}

      {partners.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No partners yet'}
          description={
            filtered
              ? 'No partner matches the current search and filters.'
              : 'Add the architects and carpenters who refer work to you.'
          }
          action={
            filtered ? (
              <Button outline href={clearHref('/partners', params)}>
                Clear filters
              </Button>
            ) : canCreate ? (
              <Button href="/partners/new">Add partner</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="code" label="Code" params={params} pathname="/partners" />
              <SortHeader column="name" label="Name" params={params} pathname="/partners" />
              <SortHeader column="type" label="Type" params={params} pathname="/partners" />
              <SortHeader column="phone" label="Phone" params={params} pathname="/partners" />
              <SortHeader column="city" label="City" params={params} pathname="/partners" />
              <SortHeader column="customers" label="Customers" params={params} pathname="/partners" align="right" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((partner) => (
              <TableRow key={partner.id} href={`/partners/${partner.id}`}>
                <TableCell className="font-mono text-xs">{partner.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{partner.name}</div>
                  {partner.firmName ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {partner.firmName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge color={partner.type === 'ARCHITECT' ? 'blue' : 'amber'}>
                    {partner.type === 'ARCHITECT' ? 'Architect' : 'Carpenter'}
                  </Badge>
                  {!partner.isActive ? (
                    <Badge color="zinc" className="ml-2">
                      Inactive
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{partner.phone}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {partner.city ?? '—'}
                </TableCell>
                <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                  {partner._count.preferredByArchitect +
                    partner._count.preferredByCarpenter}
                </TableCell>
              <TableCell>
                  <RowActions
                    name={partner.name}
                    
                    editHref={canEdit && (true) ? `/partners/${partner.id}` : undefined}
                    deleteAction={
                      canDelete && (true)
                        ? deletePartner.bind(null, partner.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${partner.name}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/partners" />
</>
      )}
    </div>
  )
}

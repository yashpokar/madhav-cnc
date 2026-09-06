import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
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
import { EmptyState, FormBanner } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
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
  const includeInactive = params.inactive === '1'

  const partners = await listPartners({
    type: activeTab.type,
    search,
    includeInactive,
  })

  const canCreate = can(user.role, 'partner:create')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)
            if (includeInactive) query.set('inactive', '1')

            const href = query.toString()
              ? `/partners?${query.toString()}`
              : '/partners'

            return (
              <Link
                key={tab.value}
                href={href}
                className={
                  isActive
                    ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search name, phone, city…" />
      </div>

      {partners.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No partners yet'}
          description={
            search
              ? 'Try a different name, phone number or city.'
              : 'Add the architects and carpenters who refer work to you.'
          }
          action={
            canCreate && !search ? (
              <Button href="/partners/new">Add partner</Button>
            ) : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Code</TableHeader>
              <TableHeader>Name</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>City</TableHeader>
              <TableHeader className="text-right">Customers</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {partners.map((partner) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

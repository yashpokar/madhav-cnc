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
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { listNotes } from '@/lib/queries/accounting'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  NOTE_KIND_COLORS,
  NOTE_KIND_SHORT,
  NOTE_REASON_LABELS,
  NOTE_STATUS_COLORS,
  NOTE_STATUS_LABELS,
} from '@/lib/labels'
import { NoteKind } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Credit & debit notes',
}

const TABS: { label: string; value: string; kind?: NoteKind }[] = [
  { label: 'All', value: 'all' },
  { label: 'Credit notes', value: 'credit', kind: 'CREDIT' },
  { label: 'Debit notes', value: 'debit', kind: 'DEBIT' },
]

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function NotesPage({ searchParams }: PageProps<'/notes'>) {
  const user = await requireCapability('note:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const notes = await listNotes({ kind: activeTab.kind, search })
  const canCreate = can(user.role, 'note:create')

  const issued = notes.filter((note) => note.status === 'ISSUED')
  const credit = issued
    .filter((note) => note.kind === 'CREDIT')
    .reduce((sum, note) => sum + note.total, 0)
  const debit = issued
    .filter((note) => note.kind === 'DEBIT')
    .reduce((sum, note) => sum + note.total, 0)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Credit &amp; debit notes</Heading>
          <Text>
            {currency.format(credit)} credit · {currency.format(debit)} debit
            issued
          </Text>
        </div>
        <div className="flex gap-3">
          {canCreate ? (
            <>
              <Button outline href="/notes/new?kind=DEBIT">
                New debit note
              </Button>
              <Button href="/notes/new?kind=CREDIT">New credit note</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/notes?${query.toString()}`
              : '/notes'

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
        <SearchField placeholder="Search note, party, invoice…" />
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No notes yet'}
          description={
            search
              ? 'Try a different note number or party.'
              : 'Raise a credit note for a sales return, or a debit note for a purchase return.'
          }
          action={
            canCreate && !search ? (
              <Button href="/notes/new?kind=CREDIT">New credit note</Button>
            ) : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Number</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Party</TableHeader>
              <TableHeader>Reason</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {notes.map((note) => (
              <TableRow key={note.id} href={`/notes/${note.id}`}>
                <TableCell className="font-mono text-xs">
                  {note.number}
                  {note.invoice ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {note.invoice.number}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge color={NOTE_KIND_COLORS[note.kind]}>
                    {NOTE_KIND_SHORT[note.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {note.customer?.name ?? note.vendorName ?? '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {NOTE_REASON_LABELS[note.reason]}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(note.noteDate)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(note.total)}
                </TableCell>
                <TableCell>
                  <Badge color={NOTE_STATUS_COLORS[note.status]}>
                    {NOTE_STATUS_LABELS[note.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

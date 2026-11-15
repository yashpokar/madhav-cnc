import { date as dateFormat, moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { ListControls } from '@/components/list-controls'
import { ListSummary } from '@/components/list-summary'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { clearHref } from '@/lib/list-href'
import { amountCeiling, applyListControls, readDateRange, readListControls } from '@/lib/list-controls'
import { sortRows } from '@/lib/table-sort'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deleteNote } from '@/lib/actions/notes'
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
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
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
import { NoteKind, NoteReason, NoteStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Credit & debit notes',
}

const TABS: { label: string; value: string; kind?: NoteKind }[] = [
  { label: 'All', value: 'all' },
  { label: 'Credit notes', value: 'credit', kind: 'CREDIT' },
  { label: 'Debit notes', value: 'debit', kind: 'DEBIT' },
]

export default async function NotesPage({ searchParams }: PageProps<'/notes'>) {
  const user = await requireCapability('note:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const status =
    typeof params.status === 'string' && params.status in NOTE_STATUS_LABELS
      ? (params.status as NoteStatus)
      : undefined
  const reason =
    typeof params.reason === 'string' && params.reason in NOTE_REASON_LABELS
      ? (params.reason as NoteReason)
      : undefined

  const [everyone, matched] = await Promise.all([
    listNotes(),
    search ? listNotes({ search }) : null,
  ])
  const { from, to } = readDateRange(params)
  const { min, max } = readListControls(params)
  const scope = (matched ?? everyone).filter(
    (note) =>
      (!activeTab.kind || note.kind === activeTab.kind) &&
      (!status || note.status === status) &&
      (!reason || note.reason === reason),
  )
  const ranged = applyListControls(scope, params, {
    date: (note) => note.noteDate,
    amount: (note) => note.total,
  })
  const filtered = Boolean(
    search || activeTab.kind || status || reason || from || to || min !== undefined || max !== undefined,
  )
  const notes = sortRows(ranged, params, {
    number: (note) => note.number,
    type: (note) => NOTE_KIND_SHORT[note.kind],
    party: (note) => note.customer?.name ?? note.vendorName,
    reason: (note) => NOTE_REASON_LABELS[note.reason],
    date: (note) => note.noteDate,
    total: (note) => note.total,
    status: (note) => NOTE_STATUS_LABELS[note.status],
  })
  const canCreate = can(user.role, 'note:create')
  const canEdit = can(user.role, 'note:update')
  const canDelete = can(user.role, 'note:delete')

  const issued = notes.filter((note) => note.status === 'ISSUED')
  const credit = issued
    .filter((note) => note.kind === 'CREDIT')
    .reduce((sum, note) => sum + note.total, 0)
  const debit = issued
    .filter((note) => note.kind === 'DEBIT')
    .reduce((sum, note) => sum + note.total, 0)

  const paged = paginate(notes, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
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

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search note, party, GSTIN, invoice…" />
        <StatusFilter
          label="Type"
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/notes"
          paramKey="tab"
          defaultValue="all"
        />
        <div className="contents">
          <FilterSelect
            param="status"
            label="Status"
            allLabel="All"
            value={status}
            options={Object.entries(NOTE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            param="reason"
            label="Reason"
            allLabel="All"
            value={reason}
            options={Object.entries(NOTE_REASON_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        {everyone.length > 0 ? (
          <ListControls
            params={params}
            pathname="/notes"
            amountLabel="Total"
            ceiling={amountCeiling(scope, (note) => note.total)}
          />
        ) : null}
      </div>

      {everyone.length > 0 ? (
        <>
          <ListSummary
            shown={notes.length}
            total={everyone.length}
            singular="note"
            plural="notes"
            filtered={filtered}
            params={params}
            pathname="/notes"
          />
        </>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No notes yet'}
          description={
            filtered
              ? 'No note matches the current search and filters.'
              : 'Raise a credit note for a sales return, or a debit note for a purchase return.'
          }
          action={
            filtered ? (
              <Button outline href={clearHref('/notes', params)}>
                Clear filters
              </Button>
            ) : canCreate ? (
              <Button href="/notes/new?kind=CREDIT">New credit note</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Number" params={params} pathname="/notes" />
              <SortHeader column="type" label="Type" params={params} pathname="/notes" />
              <SortHeader column="party" label="Party" params={params} pathname="/notes" />
              <SortHeader column="reason" label="Reason" params={params} pathname="/notes" />
              <SortHeader column="date" label="Date" params={params} pathname="/notes" />
              <SortHeader column="total" label="Total" params={params} pathname="/notes" align="right" />
              <SortHeader column="status" label="Status" params={params} pathname="/notes" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((note) => (
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
              <TableCell>
                  <RowActions
                    name={note.number}
                    viewHref={`/notes/${note.id}`}
                    editHref={canEdit && (note.status === 'DRAFT') ? `/notes/${note.id}/edit` : undefined}
                    askReason
                    deleteAction={
                      canDelete && (note.status !== 'ISSUED')
                        ? deleteNote.bind(null, note.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${note.number}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/notes" />
</>
      )}
    </div>
  )
}

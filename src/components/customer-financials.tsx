import { Badge } from '@/components/catalyst/badge'
import { fmtDate, inr, RelatedTable } from '@/components/related-table'
import { WRITE_OFF_REASON_LABELS } from '@/lib/labels'
import { customerFinancials } from '@/lib/queries/payments'

function Tile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: number
  hint?: string
  tone?: 'neutral' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'bad'
      ? 'bg-rose-50 ring-rose-950/10 dark:bg-rose-400/10 dark:ring-rose-400/20'
      : tone === 'warn'
        ? 'bg-amber-50 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
        : 'bg-zinc-50 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10'

  return (
    <div className={`rounded-lg p-4 ring-1 ${toneClass}`}>
      <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-xl/8 font-semibold tabular-nums">
        {inr.format(value)}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export async function CustomerFinancials({ id }: { id: string }) {
  const data = await customerFinancials(id)

  if (!data) {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-6 print:hidden">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Tile
          label="Billed"
          value={data.billed}
          hint={`${data.invoiceCount} issued invoice${data.invoiceCount === 1 ? '' : 's'}`}
        />
        <Tile label="Received" value={data.received} />
        <Tile
          label="Outstanding"
          value={data.outstanding}
          tone={data.overdue > 0 ? 'bad' : data.outstanding > 0 ? 'warn' : 'neutral'}
          hint={
            data.overdue > 0
              ? `${inr.format(data.overdue)} overdue`
              : data.outstanding > 0
                ? 'Not yet due'
                : 'Nothing owed'
          }
        />
        {data.onAccount > 0 ? (
          <Tile label="Advance on account" value={data.onAccount} hint="Received, not yet applied" />
        ) : null}
        {data.credit > 0 ? <Tile label="Credit notes" value={data.credit} /> : null}
        {data.writtenOff > 0 ? (
          <Tile
            label="Not recoverable"
            value={data.writtenOff}
            tone="bad"
            hint="Written off, kept for history"
          />
        ) : null}
      </div>

      {data.writeOffs.length > 0 ? (
        <RelatedTable
          title="Written-off amounts"
          count={data.writeOffs.length}
          columns={[
            { label: 'Invoice' },
            { label: 'Date' },
            { label: 'Reason' },
            { label: 'Note' },
            { label: 'Amount', align: 'right' },
          ]}
          rows={data.writeOffs.map((row) => ({
            key: row.id,
            href: `/invoices/${row.invoice.id}`,
            cells: [
              row.invoice.number,
              fmtDate(row.writtenOffOn),
              <Badge key="r" color="rose">
                {WRITE_OFF_REASON_LABELS[row.reason]}
              </Badge>,
              row.notes ?? '—',
              inr.format(row.amount),
            ],
          }))}
          empty=""
        />
      ) : null}
    </div>
  )
}

/** A loud one-line summary of what the customer owes, for the page header. */
export async function CustomerDueBanner({ id }: { id: string }) {
  const data = await customerFinancials(id)

  if (!data) {
    return null
  }

  if (data.outstanding <= 0) {
    return (
      <div
        role="status"
        className="rounded-lg bg-lime-50 px-4 py-3 text-sm/6 font-medium text-lime-800 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/20"
      >
        No dues. Everything billed has been settled.
      </div>
    )
  }

  const late = data.overdue > 0

  return (
    <div
      role="status"
      className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg px-4 py-3 ring-1 ${
        late
          ? 'bg-rose-50 text-rose-900 ring-rose-950/15 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/30'
          : 'bg-amber-50 text-amber-900 ring-amber-950/10 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20'
      }`}
    >
      <span className="text-sm/6 font-medium">
        {late ? 'Payment overdue' : 'Payment due'}
      </span>
      <span className="text-2xl/8 font-bold tabular-nums">
        {inr.format(data.outstanding)}
      </span>
      <span className="text-sm/6">
        {late
          ? `${inr.format(data.overdue)} is past its due date`
          : 'Nothing is past its due date yet'}
        {data.writtenOff > 0
          ? ` · ${inr.format(data.writtenOff)} written off earlier`
          : ''}
      </span>
    </div>
  )
}

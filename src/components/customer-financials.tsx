import { StatCard } from '@/components/stat-card'
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
  return <StatCard label={label} value={inr.format(value)} hint={hint} tone={tone} />
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
        {data.opening > 0 ? (
          <Tile
            label="Opening balance"
            value={data.opening}
            hint={
              data.openingAsOf
                ? `Owed before the system, as of ${fmtDate(data.openingAsOf)}`
                : 'Owed before the system'
            }
          />
        ) : null}
        {data.onAccount > 0 ? (
          <Tile label="Advance on account" value={data.onAccount} hint="Received, not yet applied" />
        ) : null}
        {data.creditNotes > 0 ? <Tile label="Credit notes" value={data.creditNotes} /> : null}
        {data.adjustmentNet !== 0 ? (
          <Tile
            label="Balance adjustments"
            value={Math.abs(data.adjustmentNet)}
            hint={data.adjustmentNet > 0 ? 'Added to what is owed' : 'Taken off what is owed'}
          />
        ) : null}
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
        className="surface-tinted-good px-4 py-3 text-sm/6 font-medium text-lime-800 dark:text-lime-300"
      >
        No dues. Everything billed has been settled.
      </div>
    )
  }

  const late = data.overdue > 0

  return (
    <div
      role="status"
      className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 ${
        late
          ? 'surface-tinted-bad text-rose-900 dark:text-rose-200'
          : 'surface-tinted-warn text-amber-900 dark:text-amber-200'
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

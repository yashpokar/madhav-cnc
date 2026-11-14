import { Badge } from '@/components/catalyst/badge'
import { DateRangeFilter } from '@/components/date-range-filter'
import { RangeSlider } from '@/components/range-slider'
import { amountCeiling, inDateRange, readDateRange } from '@/lib/list-controls'
import { Button } from '@/components/catalyst/button'
import { Select } from '@/components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/catalyst/table'
import { inr } from '@/components/dashboard-parts'
import { PrintButton } from '@/components/print-button'
import { SearchField } from '@/components/search-field'
import { SortHeader } from '@/components/sort-header'
import { EmptyState } from '@/components/form-banner'
import { sortRows } from '@/lib/table-sort'
import { Pagination } from '@/components/pagination'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels'
import { paginate } from '@/lib/pagination'
import { FINISHED, getOverallStatement, NOT_STARTED } from '@/lib/queries/statement'
import { OrderStatus } from '@/generated/prisma/enums'

type Params = Record<string, string | string[] | undefined>

const one = (params: Params, key: string) => {
  const value = params[key]
  const single = Array.isArray(value) ? value[0] : value

  return single && single !== 'all' ? single : undefined
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const amountParam = (params: Params, key: string) => {
  const text = one(params, key)
  const value = text === undefined ? NaN : Number(text)

  return Number.isFinite(value) && value >= 0 ? value : undefined
}

const stageLabel = (key: string) =>
  key === NOT_STARTED ? 'Not started' : key === FINISHED ? 'Finished' : key

export async function OverallStatement({
  params,
  showMoney,
}: {
  params: Params
  showMoney: boolean
}) {
  const all = await getOverallStatement()

  const customer = one(params, 'customer')
  const status = one(params, 'status')
  const material = one(params, 'material')
  const stage = one(params, 'stage')
  const balance = one(params, 'balance') === 'due' || one(params, 'balance') === 'clear' ? one(params, 'balance') : undefined
  const min = amountParam(params, 'min')
  const max = amountParam(params, 'max')
  const { from, to } = readDateRange(params)
  const q = one(params, 'q')?.trim().toLowerCase()
  const sortKeep = (['sort', 'dir'] as const).flatMap((key) => {
    const value = one(params, key)

    return value ? [[key, value] as const] : []
  })
  // Column headings keep every filter but start again from the first page.
  const sortParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => key !== 'sp'),
  )

  const customers = [...new Map(all.map((row) => [row.customer.id, row.customer.name]))].sort(
    (a, b) => a[1].localeCompare(b[1]),
  )
  const materials = [...new Set(all.flatMap((row) => row.materials))].sort()
  const stages = [
    ...new Set(all.map((row) => row.stageKey).filter((k) => k !== NOT_STARTED && k !== FINISHED)),
  ].sort()

  const matching = all.filter(
    (row) =>
      (!customer || row.customer.id === customer) &&
      (!status || row.status === status) &&
      (!material || row.materials.includes(material)) &&
      (!stage || row.stageKey === stage) &&
      (balance !== 'due' || row.due > 0.005) &&
      (balance !== 'clear' || row.due <= 0.005) &&
      (min === undefined || row.total >= min) &&
      (max === undefined || row.total <= max) &&
      inDateRange(row.orderDate, params) &&
      (!q ||
        [
          row.number,
          row.customer.name,
          row.subject,
          row.materials.join(' '),
          stageLabel(row.stageKey),
          ORDER_STATUS_LABELS[row.status],
        ].some((field) => field?.toLowerCase().includes(q))),
  )

  const rows = sortRows(matching, params, {
    order: (row) => row.number,
    date: (row) => row.orderDate,
    customer: (row) => row.customer.name,
    material: (row) => row.materials.join(', '),
    stage: (row) => stageLabel(row.stageKey),
    status: (row) => ORDER_STATUS_LABELS[row.status],
    total: (row) => row.total,
    billed: (row) => row.invoiced,
    received: (row) => row.received,
    due: (row) => row.due,
  })
  const paged = paginate(rows, params, { pageKey: 'sp', sizeKey: 'ss' })

  const totals = rows.reduce(
    (t, row) => ({
      total: t.total + row.total,
      invoiced: t.invoiced + row.invoiced,
      received: t.received + row.received,
      due: t.due + row.due,
    }),
    { total: 0, invoiced: 0, received: 0, due: 0 },
  )
  const filtered = Boolean(
    q ||
      customer ||
      status ||
      material ||
      stage ||
      balance ||
      min !== undefined ||
      max !== undefined ||
      from ||
      to,
  )


  const renderTable = (list: typeof rows) => (
    <Table plain dense grid striped>
      <TableHead>
        <TableRow>
          <SortHeader column="order" label="Order" params={sortParams} pathname="/statement" />
          <SortHeader column="date" label="Date" params={sortParams} pathname="/statement" />
          <SortHeader column="customer" label="Customer" params={sortParams} pathname="/statement" />
          <SortHeader column="material" label="Material" params={sortParams} pathname="/statement" />
          <SortHeader column="stage" label="Stage" params={sortParams} pathname="/statement" />
          <SortHeader column="status" label="Status" params={sortParams} pathname="/statement" />
          <SortHeader column="total" label="Order value" params={sortParams} pathname="/statement" align="right" />
          {showMoney ? (
            <>
              <SortHeader column="billed" label="Billed" params={sortParams} pathname="/statement" align="right" />
              <SortHeader column="received" label="Received" params={sortParams} pathname="/statement" align="right" />
              <SortHeader column="due" label="Due" params={sortParams} pathname="/statement" align="right" />
            </>
          ) : null}
        </TableRow>
      </TableHead>
      <TableBody>
        {list.map((row) => (
          <TableRow key={row.id} href={`/orders/${row.id}`}>
            <TableCell className="font-mono text-xs">{row.number}</TableCell>
            <TableCell className="text-zinc-500 dark:text-zinc-400">
              {dateFormat.format(row.orderDate)}
            </TableCell>
            <TableCell className="font-medium">{row.customer.name}</TableCell>
            <TableCell className="text-zinc-500 dark:text-zinc-400">
              {row.materials.length ? row.materials.join(', ') : '—'}
            </TableCell>
            <TableCell>
              <span
                className={
                  row.stageKey === NOT_STARTED
                    ? 'text-zinc-400'
                    : row.stageStatus === 'ON_HOLD'
                      ? 'text-amber-600 dark:text-amber-400'
                      : undefined
                }
              >
                {stageLabel(row.stageKey)}
                {row.stageStatus === 'ON_HOLD' ? ' (on hold)' : ''}
              </span>
            </TableCell>
            <TableCell>
              <Badge color={ORDER_STATUS_COLORS[row.status]}>
                {ORDER_STATUS_LABELS[row.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{inr.format(row.total)}</TableCell>
            {showMoney ? (
              <>
                <TableCell className="text-right tabular-nums">
                  {row.invoiced ? inr.format(row.invoiced) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.received ? inr.format(row.received) : '—'}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    row.due > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {row.invoiced ? inr.format(row.due) : '—'}
                </TableCell>
              </>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <section
      aria-labelledby="overall-statement"
      className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <h2
          id="overall-statement"
          className="text-sm/6 font-semibold text-zinc-950 dark:text-white"
        >
          Overall statement
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField placeholder="Search order, customer, material…" />
          <span className="text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400">
            {filtered ? `${rows.length} of ${all.length}` : all.length} order{all.length === 1 ? '' : 's'}
          </span>
          <div className="print:hidden">
            <PrintButton label="Print statement" />
          </div>
        </div>
      </header>

      <form
        method="get"
        action="/statement"
        className="grid grid-cols-2 items-end gap-3 px-3 py-3 lg:grid-cols-4 print:hidden"
      >
        {[...sortKeep, ...(q ? [['q', one(params, 'q') ?? ''] as const] : [])].map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Customer
          <Select name="customer" defaultValue={customer ?? 'all'}>
            <option value="all">All customers</option>
            {customers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Status
          <Select name="status" defaultValue={status ?? 'all'}>
            <option value="all">All statuses</option>
            {Object.values(OrderStatus).map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Material
          <Select name="material" defaultValue={material ?? 'all'}>
            <option value="all">All materials</option>
            {materials.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Stage
          <Select name="stage" defaultValue={stage ?? 'all'}>
            <option value="all">All stages</option>
            <option value={NOT_STARTED}>Not started</option>
            {stages.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={FINISHED}>Finished</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Balance
          <Select name="balance" defaultValue={balance ?? 'all'}>
            <option value="all">Any balance</option>
            <option value="due">Has a balance due</option>
            <option value="clear">Nothing due</option>
          </Select>
        </label>
        <DateRangeFilter
          label="Order date"
          defaultFrom={from}
          defaultTo={to}
          className="col-span-2"
        />
        <RangeSlider
          label="Order amount"
          ceiling={amountCeiling(all, (row) => row.total)}
          defaultMin={min}
          defaultMax={max}
          className="col-span-2"
        />
        <div className="flex gap-2">
          <Button type="submit">Apply</Button>
          {filtered ? (
            <Button plain href="/statement">
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="px-3 pb-3">
          <EmptyState
            title={filtered ? 'No matches' : 'No orders yet'}
            description={
              filtered
                ? 'No orders fit the current search and filters.'
                : 'Orders appear here once they are created.'
            }
            action={
              filtered ? (
                <Button outline href="/statement">
                  Clear filters
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto px-3 pb-3">
          <div className="print:hidden">{renderTable(paged.rows)}</div>
          <div className="hidden print:block">{renderTable(rows)}</div>
          <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm/6 tabular-nums">
            <span className="text-zinc-500 dark:text-zinc-400">
              {filtered ? 'Filtered total' : 'Total'}
            </span>
            <span>Order value {inr.format(totals.total)}</span>
            {showMoney ? (
              <>
                <span>Billed {inr.format(totals.invoiced)}</span>
                <span>Received {inr.format(totals.received)}</span>
                <span className="font-semibold">Due {inr.format(totals.due)}</span>
              </>
            ) : null}
          </div>
          <Pagination paged={paged} params={params} pathname="/statement" pageKey="sp" sizeKey="ss" />
        </div>
      )}
    </section>
  )
}

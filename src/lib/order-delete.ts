/** Everything an order is tied to, so deleting it can be explained first. */
export type OrderImpact = {
  lines: number
  tasks: number
  invoices: string[]
  dispatches: string[]
  expenses: number
  advance: { number: string; amount: number } | null
  quotation: string | null
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * What deleting an order would do. Invoices and challans block it: they are
 * billing and delivery records that must not lose their order. Everything
 * else is either removed with the order or kept and unlinked.
 */
export function describeOrderDelete(impact: OrderImpact) {
  const blockers = [
    ...impact.invoices.map((number) => `invoice ${number}`),
    ...impact.dispatches.map((number) => `challan ${number}`),
  ]

  const removes = [
    impact.lines > 0 ? plural(impact.lines, 'item line') : null,
    impact.tasks > 0 ? plural(impact.tasks, 'production task') : null,
  ].filter((text): text is string => Boolean(text))

  const keeps = [
    impact.advance
      ? `The advance receipt ${impact.advance.number} (${inr.format(impact.advance.amount)}) stays, as credit on the customer's account.`
      : null,
    impact.expenses > 0
      ? `${plural(impact.expenses, 'expense')} stay${impact.expenses === 1 ? 's' : ''} on record, no longer linked to an order.`
      : null,
    impact.quotation ? `Quotation ${impact.quotation} goes back to Accepted.` : null,
  ].filter((text): text is string => Boolean(text))

  return {
    blocked:
      blockers.length > 0
        ? `This order has ${list(blockers)}. Delete ${blockers.length === 1 ? 'it' : 'them'} first, so billing and delivery records never point at a missing order.`
        : null,
    removes,
    keeps,
  }
}

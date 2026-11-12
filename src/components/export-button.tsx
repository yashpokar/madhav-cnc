import { ArrowDownTrayIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'

/** Downloads the current list (honouring search and status) as a CSV file. */
export function ExportButton({
  kind,
  search,
  status,
}: {
  kind: 'customers' | 'quotations' | 'orders' | 'invoices' | 'payments' | 'expenses'
  search?: string
  status?: string
}) {
  const query = new URLSearchParams()

  if (search) query.set('q', search)
  if (status) query.set('status', status)

  const href = `/api/export/${kind}${query.size ? `?${query.toString()}` : ''}`

  return (
    <Button outline href={href} prefetch={false} download aria-label={`Export ${kind} as CSV`}>
      <ArrowDownTrayIcon />
      Export CSV
    </Button>
  )
}

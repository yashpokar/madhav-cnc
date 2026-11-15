import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { baseUrl } from '@/lib/api/public-url'
import { actorOf, must } from '@/lib/api/writes'
import { money } from '@/lib/format'
import { getInvoice } from '@/lib/queries/invoices'
import { getCompanySetting } from '@/lib/queries/company'
import { invoiceShareParts } from '@/lib/share-links'
import { ensureInvoiceShareLink } from '@/lib/services/invoices'

/** The customer link of an issued invoice (made on first use) with the WhatsApp message. A draft is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'invoice:update', idempotent: true },
  async ({ params, user }) => {
    const { token, created } = must(await ensureInvoiceShareLink(actorOf(user), params.id))
    const [invoice, company] = await Promise.all([getInvoice(params.id), getCompanySetting()])

    if (!invoice) throw new ApiError('NOT_FOUND', 'Invoice not found.')

    const amountLine =
      invoice.due > 0
        ? `The amount due is ${money.format(invoice.due)}`
        : `The total is ${money.format(invoice.total)} (paid in full)`

    const parts = invoiceShareParts({
      baseUrl: baseUrl(),
      token,
      customerName: invoice.customer.name,
      customerPhone: invoice.customer.phone,
      invoiceNumber: invoice.number,
      companyName: company.companyName,
      amountLine,
    })

    return reply({ ...parts, created })
  },
)

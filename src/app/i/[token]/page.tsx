import { date as dateFormat, money as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { PoweredBy } from '@/components/powered-by'
import { shareMetadata } from '@/lib/share-metadata'
import { notFound } from 'next/navigation'
import { describeLineDetails } from '@/lib/line-details'
import { UNIT_SHORT } from '@/lib/labels'
import {
  getInvoiceCompany,
  getSharedInvoiceByToken,
} from '@/lib/queries/invoice-share'
import { listDocumentPaymentModes } from '@/lib/queries/payment-modes'
import { PrintButton } from './print-button'

export async function generateMetadata({
  params,
}: PageProps<'/i/[token]'>): Promise<Metadata> {
  const { token } = await params
  const invoice = await getSharedInvoiceByToken(token)

  if (!invoice) {
    return shareMetadata({ kind: 'Invoice' })
  }

  const company = await getInvoiceCompany(invoice.companyId)

  return shareMetadata({
    kind: 'Invoice',
    company: company?.companyName,
    number: invoice.number,
  })
}

const STATE_LABEL = {
  UNPAID: 'Payment due',
  PART_PAID: 'Part paid',
  PAID: 'Paid',
  WRITTEN_OFF: 'Settled',
} as const

const STATE_STYLE = {
  UNPAID: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  PART_PAID: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  PAID: 'bg-green-50 text-green-800 ring-green-600/20',
  WRITTEN_OFF: 'bg-zinc-100 text-zinc-700 ring-zinc-600/20',
} as const

export default async function SharedInvoicePage({
  params,
}: PageProps<'/i/[token]'>) {
  const { token } = await params

  // Unknown token, draft or cancelled invoice: all the same 404.
  const invoice = await getSharedInvoiceByToken(token)

  if (!invoice) {
    notFound()
  }

  const [company, modes] = await Promise.all([
    getInvoiceCompany(invoice.companyId),
    listDocumentPaymentModes(invoice.companyId),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:py-0">
      <header className="flex flex-col gap-5 border-b border-zinc-950/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {company?.logoStoredName ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo served by our token route; next/image cannot optimise it
            <img
              src={`/i/${token}/logo`}
              alt={company.companyName}
              className="size-16 shrink-0 rounded-full object-contain sm:size-20"
            />
          ) : null}
          <div>
            <div className="text-lg/7 font-semibold text-zinc-950">
              {company?.companyName ?? 'Invoice'}
            </div>
            <div className="mt-1 text-sm/6 text-zinc-600">
              {[company?.addressLine, company?.city, company?.state, company?.pincode]
                .filter(Boolean)
                .join(', ')}
            </div>
            <div className="text-sm/6 text-zinc-600">
              {[company?.phone, company?.email].filter(Boolean).join(' · ')}
            </div>
            {company?.gstin ? (
              <div className="text-sm/6 text-zinc-600">
                GSTIN {company.gstin}
                {company.pan ? ` · PAN ${company.pan}` : ''}
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="text-base/6 font-semibold text-zinc-950">Tax invoice</div>
          <div className="font-mono text-sm/6 font-semibold text-zinc-950">
            {invoice.number}
          </div>
          <div className="text-sm/6 text-zinc-600">
            {dateFormat.format(invoice.invoiceDate)}
          </div>
          {invoice.dueDate ? (
            <div className="text-sm/6 text-zinc-600">
              Due {dateFormat.format(invoice.dueDate)}
            </div>
          ) : null}
          <span
            className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs/5 font-medium ring-1 ring-inset ${STATE_STYLE[invoice.paymentState]}`}
          >
            {STATE_LABEL[invoice.paymentState]}
          </span>
        </div>
      </header>

      <div className="mt-4 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500">
            Bill to
          </div>
          <div className="mt-1 text-sm/6 font-medium text-zinc-950">
            {invoice.customerName}
          </div>
          {invoice.billingAddress ? (
            <div className="whitespace-pre-line text-sm/6 text-zinc-600">
              {invoice.billingAddress}
            </div>
          ) : null}
          {invoice.customerGstin ? (
            <div className="text-sm/6 text-zinc-600">GSTIN {invoice.customerGstin}</div>
          ) : null}
        </div>
        <div>
          <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500">
            Supply
          </div>
          <div className="mt-1 text-sm/6 text-zinc-600">
            {invoice.placeOfSupply ? <div>Place: {invoice.placeOfSupply}</div> : null}
            <div>
              {invoice.isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm/6">
          <thead className="border-b border-zinc-950/10 text-xs/5 uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">HSN</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Rate</th>
              <th className="py-2 pr-3 text-right font-medium">Taxable</th>
              {invoice.isInterState ? (
                <th className="py-2 pr-3 text-right font-medium">IGST</th>
              ) : (
                <>
                  <th className="py-2 pr-3 text-right font-medium">CGST</th>
                  <th className="py-2 pr-3 text-right font-medium">SGST</th>
                </>
              )}
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5">
            {invoice.lines.map((line) => {
              const details = describeLineDetails(line)

              return (
                <tr key={line.id} className="align-top">
                  <td className="py-3 pr-2 tabular-nums text-zinc-500">{line.position}</td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-950">{line.description}</div>
                    {details ? (
                      <div className="text-xs/5 text-zinc-500">{details}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 text-zinc-600">{line.hsnCode ?? '—'}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {line.quantity} {UNIT_SHORT[line.unit]}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {currency.format(line.rate)}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {currency.format(line.amount)}
                  </td>
                  {invoice.isInterState ? (
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {currency.format(line.igstAmount)}
                    </td>
                  ) : (
                    <>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        {currency.format(line.cgstAmount)}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        {currency.format(line.sgstAmount)}
                      </td>
                    </>
                  )}
                  <td className="py-3 text-right font-medium tabular-nums">
                    {currency.format(line.lineTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-end">
        <dl className="grid w-full grid-cols-2 gap-y-2 text-sm/6 sm:max-w-xs">
          <dt className="text-zinc-600">Subtotal</dt>
          <dd className="text-right tabular-nums">{currency.format(invoice.subtotal)}</dd>
          {invoice.discountAmount > 0 ? (
            <>
              <dt className="text-zinc-600">Discount</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(invoice.discountAmount)}
              </dd>
            </>
          ) : null}
          {invoice.transportCharge > 0 ? (
            <>
              <dt className="text-zinc-600">Transport</dt>
              <dd className="text-right tabular-nums">
                {currency.format(invoice.transportCharge)}
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-600">Taxable</dt>
          <dd className="text-right tabular-nums">{currency.format(invoice.taxableAmount)}</dd>
          {invoice.isInterState ? (
            <>
              <dt className="text-zinc-600">IGST</dt>
              <dd className="text-right tabular-nums">{currency.format(invoice.igstAmount)}</dd>
            </>
          ) : (
            <>
              <dt className="text-zinc-600">CGST</dt>
              <dd className="text-right tabular-nums">{currency.format(invoice.cgstAmount)}</dd>
              <dt className="text-zinc-600">SGST</dt>
              <dd className="text-right tabular-nums">{currency.format(invoice.sgstAmount)}</dd>
            </>
          )}
          {invoice.roundOff !== 0 ? (
            <>
              <dt className="text-zinc-600">Round off</dt>
              <dd className="text-right tabular-nums">{currency.format(invoice.roundOff)}</dd>
            </>
          ) : null}
          <dt className="border-t border-zinc-950/10 pt-2 font-semibold text-zinc-950">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right text-base/6 font-semibold tabular-nums text-zinc-950">
            {currency.format(invoice.total)}
          </dd>
          {invoice.paid > 0 ? (
            <>
              <dt className="text-zinc-600">Amount paid</dt>
              <dd className="text-right tabular-nums">−{currency.format(invoice.paid)}</dd>
            </>
          ) : null}
          <dt className="font-semibold text-zinc-950">Balance due</dt>
          <dd className="text-right text-base/6 font-semibold tabular-nums text-zinc-950">
            {currency.format(invoice.due)}
          </dd>
        </dl>
      </section>

      {invoice.due > 0 && modes.length > 0 ? (
        <section className="mt-10 grid grid-cols-1 gap-4 break-inside-avoid">
          <h2 className="text-base/6 font-semibold text-zinc-950">How to pay</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {modes.map((mode) => (
              <div
                key={mode.id}
                className="flex items-start justify-between gap-4 break-inside-avoid rounded-lg p-4 ring-1 ring-zinc-950/10"
              >
                <div className="min-w-0 text-sm/6">
                  <div className="font-medium text-zinc-950">{mode.name}</div>
                  {mode.details.length > 0 ? (
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      {mode.details.map((detail, index) => (
                        <div key={index} className="contents">
                          <dt className="text-zinc-500">{detail.label}</dt>
                          <dd className="min-w-0 break-words font-medium text-zinc-950">
                            {detail.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
                {mode.hasQr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR served by our token route; next/image cannot optimise it
                  <img
                    src={`/i/${token}/qr/${mode.id}`}
                    alt={`${mode.name} QR code`}
                    className="size-24 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-zinc-950/10"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {invoice.terms ? (
        <section className="mt-10">
          <h2 className="text-sm/6 font-semibold text-zinc-950">Terms &amp; conditions</h2>
          <p className="mt-2 whitespace-pre-line text-sm/6 text-zinc-700">{invoice.terms}</p>
        </section>
      ) : null}

      {company && (company.signatureStoredName || company.stampStoredName || company.signatoryName) ? (
        <section className="mt-12 flex break-inside-avoid justify-end">
          <div className="w-64 text-sm/6">
            <div className="text-right font-medium text-zinc-950">For {company.companyName}</div>
            <div className="flex h-24 items-end justify-end gap-4">
              {company.stampStoredName ? (
                // eslint-disable-next-line @next/next/no-img-element -- stamp served by our token route; next/image cannot optimise it
                <img
                  src={`/i/${token}/asset/stamp`}
                  alt="Company stamp"
                  className="max-h-24 object-contain"
                />
              ) : null}
              {company.signatureStoredName ? (
                // eslint-disable-next-line @next/next/no-img-element -- signature served by our token route; next/image cannot optimise it
                <img
                  src={`/i/${token}/asset/signature`}
                  alt="Authorised signature"
                  className="max-h-16 max-w-48 object-contain"
                />
              ) : null}
            </div>
            <div className="border-t border-zinc-400 pt-1.5 text-right">
              {company.signatoryName ? (
                <div className="font-medium text-zinc-950">{company.signatoryName}</div>
              ) : null}
              <div className="text-zinc-600">{company.signatoryTitle || 'Authorised signatory'}</div>
            </div>
          </div>
        </section>
      ) : null}

      <PoweredBy />
    </main>
  )
}

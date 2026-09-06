import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  findShareByToken,
  getPublicCompany,
  getSharedQuotation,
  shareIsUsable,
} from '@/lib/queries/share'
import { DIMENSION_UNIT_SHORT, UNIT_SHORT } from '@/lib/labels'
import { PaymentTerms } from '@/components/payment-terms'
import { CommentBox, RespondPanel } from './respond'
import { PrintButton } from './print-button'

export const metadata: Metadata = {
  title: 'Quotation',
  robots: { index: false, follow: false },
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export default async function SharedQuotationPage({
  params,
}: PageProps<'/q/[token]'>) {
  const { token } = await params

  const share = await findShareByToken(token)

  if (!share) {
    notFound()
  }

  if (!shareIsUsable(share)) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center p-6">
        <div className="text-center">
          <h1 className="text-lg/7 font-semibold text-zinc-950">
            This link is no longer available
          </h1>
          <p className="mt-2 text-sm/6 text-zinc-600">
            Please ask us for an up-to-date link.
          </p>
        </div>
      </main>
    )
  }

  const [quotation, company] = await Promise.all([
    getSharedQuotation(share.quotationId),
    getPublicCompany(),
  ])

  if (!quotation) {
    notFound()
  }

  await prisma.quotationShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  })

  const generalComments = quotation.comments.filter(
    (comment) => comment.attachmentId === null,
  )

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:py-0">
      <header className="flex flex-col gap-5 border-b border-zinc-950/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {company?.logoStoredName ? (
            <img
              src={`/q/${token}/logo`}
              alt={company.companyName ?? 'Logo'}
              className="size-16 shrink-0 rounded-full object-contain sm:size-20"
            />
          ) : null}
          <div>
          <div className="text-lg/7 font-semibold text-zinc-950">
            {company?.companyName ?? 'Quotation'}
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
            <div className="text-sm/6 text-zinc-600">GSTIN {company.gstin}</div>
          ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="font-mono text-sm/6 font-semibold text-zinc-950">
            {quotation.number}
            {quotation.revision > 1 ? ` R${quotation.revision}` : ''}
          </div>
          <div className="text-sm/6 text-zinc-600">
            {dateFormat.format(quotation.quotationDate)}
          </div>
          {quotation.validUntil ? (
            <div className="text-sm/6 text-zinc-600">
              Valid until {dateFormat.format(quotation.validUntil)}
            </div>
          ) : null}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500">
            Quotation for
          </div>
          <div className="mt-1 text-sm/6 font-medium text-zinc-950">
            {quotation.customer.name}
          </div>
          <div className="text-sm/6 text-zinc-600">{quotation.customer.phone}</div>
        </div>
        {quotation.siteAddress || quotation.siteCity ? (
          <div>
            <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500">
              Site
            </div>
            <div className="mt-1 text-sm/6 text-zinc-600">
              {[quotation.siteAddress, quotation.siteCity, quotation.sitePincode]
                .filter(Boolean)
                .join(', ')}
            </div>
          </div>
        ) : null}
      </section>

      {quotation.subject ? (
        <p className="mt-6 text-sm/6 text-zinc-950">{quotation.subject}</p>
      ) : null}

      <section className="mt-8 grid grid-cols-1 gap-3 sm:hidden">
        {quotation.lines.map((line) => (
          <div
            key={line.id}
            className="rounded-lg p-4 ring-1 ring-zinc-950/10"
          >
            <div className="font-medium text-zinc-950">{line.description}</div>
            {line.materialSupply === 'WITHOUT_MATERIAL' ? (
              <div className="mt-0.5 text-xs/5 text-zinc-500">
                Job work only — material supplied by you
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm/6">
              {line.dimensionUnit && line.length && line.width ? (
                <>
                  <dt className="text-zinc-500">Size</dt>
                  <dd className="text-right">
                    {line.length} × {line.width}{' '}
                    {DIMENSION_UNIT_SHORT[line.dimensionUnit]}
                    {line.pieces ? ` × ${line.pieces}` : ''}
                  </dd>
                </>
              ) : null}
              <dt className="text-zinc-500">Quantity</dt>
              <dd className="text-right tabular-nums">
                {line.quantity} {UNIT_SHORT[line.unit]}
              </dd>
              <dt className="text-zinc-500">Rate</dt>
              <dd className="text-right tabular-nums">
                {currency.format(line.rate)}
              </dd>
              <dt className="font-medium text-zinc-950">Amount</dt>
              <dd className="text-right font-semibold tabular-nums text-zinc-950">
                {currency.format(line.amount)}
              </dd>
            </dl>
          </div>
        ))}
      </section>

      <section className="mt-8 hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm/6">
          <thead className="border-b border-zinc-950/10 text-xs/5 uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">Size</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5">
            {quotation.lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-3 pr-2 tabular-nums text-zinc-500">
                  {line.position}
                </td>
                <td className="py-3 pr-3">
                  <div className="font-medium text-zinc-950">
                    {line.description}
                  </div>
                  {line.materialSupply === 'WITHOUT_MATERIAL' ? (
                    <div className="text-xs/5 text-zinc-500">
                      Job work only — material supplied by you
                    </div>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-zinc-600">
                  {line.dimensionUnit && line.length && line.width
                    ? `${line.length} × ${line.width} ${DIMENSION_UNIT_SHORT[line.dimensionUnit]}${
                        line.pieces ? ` × ${line.pieces}` : ''
                      }`
                    : '—'}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  {line.quantity} {UNIT_SHORT[line.unit]}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  {currency.format(line.rate)}
                </td>
                <td className="py-3 text-right font-medium tabular-nums">
                  {currency.format(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-end">
        <dl className="grid w-full grid-cols-2 gap-y-2 text-sm/6 sm:max-w-xs">
          <dt className="text-zinc-600">Subtotal</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.subtotal)}
          </dd>
          {quotation.discountAmount > 0 ? (
            <>
              <dt className="text-zinc-600">Discount</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(quotation.discountAmount)}
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-600">GST</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.taxAmount)}
          </dd>
          {quotation.roundOff !== 0 ? (
            <>
              <dt className="text-zinc-600">Round off</dt>
              <dd className="text-right tabular-nums">
                {currency.format(quotation.roundOff)}
              </dd>
            </>
          ) : null}
          <dt className="border-t border-zinc-950/10 pt-2 font-semibold text-zinc-950">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right text-base/6 font-semibold tabular-nums text-zinc-950">
            {currency.format(quotation.total)}
          </dd>
        </dl>
      </section>

      {quotation.attachments.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-base/6 font-semibold text-zinc-950">
            Design references
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {quotation.attachments.map((item) => {
              const itemComments = quotation.comments.filter(
                (comment) => comment.attachmentId === item.id,
              )

              return (
                <figure
                  key={item.id}
                  className="grid grid-cols-1 gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10"
                >
                  <a
                    href={`/q/${token}/image/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md bg-zinc-100"
                  >
                    {item.mimeType === 'application/pdf' ? (
                      <div className="flex h-48 items-center justify-center text-sm/6 text-zinc-500">
                        Open PDF · {item.fileName}
                      </div>
                    ) : (
                      <img
                        src={`/q/${token}/image/${item.id}`}
                        alt={item.comment ?? item.fileName}
                        className="h-48 w-full object-cover"
                      />
                    )}
                  </a>

                  {item.comment ? (
                    <figcaption className="text-sm/6 text-zinc-700">
                      {item.comment}
                    </figcaption>
                  ) : null}

                  {itemComments.length > 0 ? (
                    <ul className="grid grid-cols-1 gap-2 print:hidden">
                      {itemComments.map((comment) => (
                        <li
                          key={comment.id}
                          className="rounded-md bg-zinc-50 px-3 py-2 text-sm/6"
                        >
                          <div className="text-xs/5 text-zinc-500">
                            {comment.authorType === 'CUSTOMER'
                              ? (comment.authorName ?? 'You')
                              : (comment.authorUser?.name ??
                                company?.companyName ??
                                'Us')}{' '}
                            · {timeFormat.format(comment.createdAt)}
                          </div>
                          <div className="text-zinc-800">{comment.body}</div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {share.decision === 'PENDING' ? (
                    <div className="print:hidden">
                      <CommentBox
                        token={token}
                        attachmentId={item.id}
                        label="Comment on this"
                      />
                    </div>
                  ) : null}
                </figure>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="mt-10">
        <PaymentTerms
          total={quotation.total}
          advancePercent={quotation.advancePercent}
          company={company}
          qrSrc={company?.upiQrStoredName ? `/q/${token}/qr` : null}
        />
      </div>

      {quotation.notes || quotation.terms ? (
        <section className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {quotation.notes ? (
            <div>
              <h2 className="text-sm/6 font-semibold text-zinc-950">Notes</h2>
              <p className="mt-2 whitespace-pre-line text-sm/6 text-zinc-700">
                {quotation.notes}
              </p>
            </div>
          ) : null}
          {quotation.terms ? (
            <div>
              <h2 className="text-sm/6 font-semibold text-zinc-950">
                Terms &amp; conditions
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm/6 text-zinc-700">
                {quotation.terms}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {generalComments.length > 0 ? (
        <section className="mt-10 print:hidden">
          <h2 className="text-base/6 font-semibold text-zinc-950">Conversation</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {generalComments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-md bg-zinc-50 px-3 py-2 text-sm/6"
              >
                <div className="text-xs/5 text-zinc-500">
                  {comment.authorType === 'CUSTOMER'
                    ? (comment.authorName ?? 'You')
                    : (comment.authorUser?.name ?? company?.companyName ?? 'Us')}{' '}
                  · {timeFormat.format(comment.createdAt)}
                </div>
                <div className="text-zinc-800">{comment.body}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 print:hidden">
        <RespondPanel
          token={token}
          decision={share.decision}
          respondedByName={share.respondedByName}
          respondedAt={share.respondedAt}
          responseNote={share.responseNote}
        />
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        {share.decision === 'PENDING' ? (
          <CommentBox token={token} label="Ask a question" />
        ) : null}
      </section>
    </main>
  )
}

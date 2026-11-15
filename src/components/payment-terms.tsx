import { money as currency } from '@/lib/format'
import { paymentSplit } from '@/lib/pricing'
import type { DocumentPaymentMode } from '@/lib/queries/payment-modes'

/**
 * The advance and balance, and the ways to pay: every payment mode the company
 * has chosen to show, each with whatever details the owner added (bank, account
 * number, IFSC, UPI ID, anything) and its QR code if it has one.
 */
export function PaymentTerms({
  total,
  advancePercent,
  modes,
  qrSrc,
}: {
  total: number
  advancePercent: number
  modes: DocumentPaymentMode[]
  /** Where a mode's QR code is served from; differs for public pages. */
  qrSrc: (modeId: string) => string
}) {
  const { advance, balance } = paymentSplit(total, advancePercent)

  return (
    <section className="grid grid-cols-1 gap-5">
      <h2 className="text-base/6 font-semibold text-zinc-950 dark:text-white">
        Payment
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
          <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Advance payable ({advancePercent}%)
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums text-zinc-950 dark:text-white">
            {currency.format(advance)}
          </div>
          <div className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400">
            Payable before work begins
          </div>
        </div>

        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
          <div className="text-xs/5 font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Balance ({Math.round((100 - advancePercent) * 100) / 100}%)
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums text-zinc-950 dark:text-white">
            {currency.format(balance)}
          </div>
          <div className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400">
            Payable on delivery
          </div>
        </div>
      </div>

      {modes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modes.map((mode) => (
            <div
              key={mode.id}
              className="flex items-start justify-between gap-4 break-inside-avoid rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10"
            >
              <div className="min-w-0 text-sm/6">
                <div className="font-medium text-zinc-950 dark:text-white">{mode.name}</div>
                {mode.details.length > 0 ? (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {mode.details.map((detail, index) => (
                      <div key={index} className="contents">
                        <dt className="text-zinc-500 dark:text-zinc-400">{detail.label}</dt>
                        <dd className="min-w-0 break-words font-medium text-zinc-950 dark:text-white">
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
              {mode.hasQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrSrc(mode.id)}
                  alt={`${mode.name} QR code`}
                  className="size-24 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-zinc-950/10"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

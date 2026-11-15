import clsx from 'clsx'
import { money as currency } from '@/lib/format'
import { paymentSplit } from '@/lib/pricing'
import { upiPayLink } from '@/lib/payment-methods'
import type { DocumentPaymentMode } from '@/lib/queries/payment-modes'

/** Values people copy into a banking app: easy to select in one click, monospaced. */
const COPYABLE = new Set(['vpa', 'accountNumber', 'ifsc'])

/**
 * The advance and balance, and a "How to pay" block: every payment mode the
 * company has chosen to show, with its fixed fields (UPI ID, account number,
 * IFSC, payable-to...), any extras the owner added, and its QR code if it has
 * one. A UPI ID also gets a tap-to-pay link on screen.
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
        <div className="surface-card p-4">
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

        <div className="surface-card p-4">
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

      <HowToPay modes={modes} qrSrc={qrSrc} />
    </section>
  )
}

/**
 * The "How to pay" cards. A UPI ID gets a tap-to-pay link on screen (with the
 * amount and a note when given). `light` drops dark-mode colours, for the
 * public pages that are always light.
 */
export function HowToPay({
  modes,
  qrSrc,
  amount,
  note,
  light = false,
}: {
  modes: DocumentPaymentMode[]
  qrSrc: (modeId: string) => string
  amount?: number
  note?: string
  light?: boolean
}) {
  if (modes.length === 0) return null

  const muted = clsx('text-zinc-500', !light && 'dark:text-zinc-400')
  const strong = clsx('text-zinc-950', !light && 'dark:text-white')

  return (
    <div className="grid grid-cols-1 gap-4">
      <h3 className={clsx('text-sm/6 font-semibold', strong)}>How to pay</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modes.map((mode) => {
          const vpa = mode.account.find((row) => row.key === 'vpa')?.value
          const payee = mode.account.find((row) => row.key === 'payeeName')?.value
          const link = mode.kind === 'UPI' && vpa ? upiPayLink(vpa, payee, amount, note) : null

          return (
            <div
              key={mode.id}
              className={clsx(
                'flex items-start justify-between gap-4 break-inside-avoid rounded-lg p-4 ring-1 ring-zinc-950/10',
                !light && 'dark:ring-white/10',
              )}
            >
              <div className="min-w-0 text-sm/6">
                <div className={clsx('font-medium', strong)}>{mode.name}</div>
                {mode.account.length + mode.details.length > 0 ? (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {mode.account.map((row) => (
                      <div key={row.key} className="contents">
                        <dt className={muted}>{row.label}</dt>
                        <dd
                          className={clsx(
                            'min-w-0 font-medium',
                            strong,
                            COPYABLE.has(row.key) ? 'select-all break-all font-mono' : 'break-words',
                          )}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                    {mode.details.map((detail, index) => (
                      <div key={`extra-${index}`} className="contents">
                        <dt className={muted}>{detail.label}</dt>
                        <dd className={clsx('min-w-0 break-words font-medium', strong)}>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {link ? (
                  <a
                    href={link}
                    className={clsx(
                      'mt-2 inline-block text-sm/6 font-medium text-blue-600 underline underline-offset-2 hover:no-underline print:hidden',
                      !light && 'dark:text-blue-400',
                    )}
                  >
                    Pay with UPI
                  </a>
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
          )
        })}
      </div>
    </div>
  )
}

import { paymentSplit } from '@/lib/pricing'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export type PaymentCompany = {
  bankAccountName: string | null
  bankName: string | null
  bankBranch: string | null
  accountNumber: string | null
  ifscCode: string | null
  upiId: string | null
} | null

export function PaymentTerms({
  total,
  advancePercent,
  company,
  qrSrc,
}: {
  total: number
  advancePercent: number
  company: PaymentCompany
  qrSrc?: string | null
}) {
  const { advance, balance } = paymentSplit(total, advancePercent)

  const hasBank = Boolean(company?.accountNumber && company?.ifscCode)
  const hasUpi = Boolean(company?.upiId) || Boolean(qrSrc)

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

      {hasBank || hasUpi ? (
        <div className="grid grid-cols-1 gap-6 rounded-lg p-4 ring-1 ring-zinc-950/10 sm:grid-cols-2 dark:ring-white/10">
          {hasBank ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm/6">
              <dt className="text-zinc-500 dark:text-zinc-400">Account</dt>
              <dd className="font-medium text-zinc-950 dark:text-white">
                {company?.bankAccountName ?? '—'}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Bank</dt>
              <dd>
                {[company?.bankName, company?.bankBranch]
                  .filter(Boolean)
                  .join(' · ')}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">A/C no.</dt>
              <dd className="font-mono tabular-nums">{company?.accountNumber}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">IFSC</dt>
              <dd className="font-mono">{company?.ifscCode}</dd>
            </dl>
          ) : null}

          {hasUpi ? (
            <div className="flex items-start gap-4">
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt="UPI QR code"
                  className="size-28 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-zinc-950/10"
                />
              ) : null}
              <div className="text-sm/6">
                <div className="text-zinc-500 dark:text-zinc-400">
                  Pay by UPI
                </div>
                {company?.upiId ? (
                  <div className="font-mono font-medium text-zinc-950 dark:text-white">
                    {company.upiId}
                  </div>
                ) : null}
                {qrSrc ? (
                  <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                    Scan the code with any UPI app
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

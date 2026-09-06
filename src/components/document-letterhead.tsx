const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function DocumentLetterhead({
  company,
  title,
  reference,
  date,
  secondaryLabel,
  secondaryDate,
}: {
  company: {
    companyName: string
    addressLine: string | null
    city: string | null
    state: string | null
    pincode: string | null
    phone: string | null
    email: string | null
    gstin: string | null
    logoStoredName: string | null
  }
  title: string
  reference: string
  date: Date
  secondaryLabel?: string
  secondaryDate?: Date | null
}) {
  return (
    <div className="hidden print:block">
      <div className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-4">
        <div className="flex items-start gap-4">
          {company.logoStoredName ? (
            <img
              src="/api/company/logo"
              alt=""
              className="size-16 shrink-0 object-contain"
            />
          ) : null}
          <div>
            <div className="text-lg font-semibold">{company.companyName}</div>
            <div className="text-sm text-zinc-600">
              {[
                company.addressLine,
                company.city,
                company.state,
                company.pincode,
              ]
                .filter(Boolean)
                .join(', ')}
            </div>
            <div className="text-sm text-zinc-600">
              {[company.phone, company.email].filter(Boolean).join(' · ')}
            </div>
            {company.gstin ? (
              <div className="text-sm text-zinc-600">GSTIN {company.gstin}</div>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{title}</div>
          <div className="font-mono text-sm">{reference}</div>
          <div className="text-sm text-zinc-600">{dateFormat.format(date)}</div>
          {secondaryLabel && secondaryDate ? (
            <div className="text-sm text-zinc-600">
              {secondaryLabel} {dateFormat.format(secondaryDate)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

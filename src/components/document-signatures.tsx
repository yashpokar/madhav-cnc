/**
 * The foot of a printed tax document: a line for the customer to sign, and the
 * company's signature and stamp above the authorised signatory's name. Only
 * shown when printing.
 */
export function DocumentSignatures({
  company,
}: {
  company: {
    companyName: string
    signatureStoredName: string | null
    stampStoredName: string | null
    signatoryName: string | null
    signatoryTitle: string | null
  }
}) {
  return (
    <div className="hidden break-inside-avoid pt-10 print:block">
      <div className="grid grid-cols-2 gap-16 text-sm">
        <div className="flex flex-col justify-end">
          <div className="h-24" />
          <div className="border-t border-zinc-400 pt-1.5 text-zinc-600">
            Customer&apos;s signature
          </div>
        </div>

        <div className="flex flex-col">
          <div className="text-right font-medium">For {company.companyName}</div>
          <div className="flex h-24 items-end justify-end gap-4">
            {company.stampStoredName ? (
              <img src="/api/company/stamp" alt="Company stamp" className="max-h-24 object-contain" />
            ) : null}
            {company.signatureStoredName ? (
              <img
                src="/api/company/signature"
                alt="Authorised signature"
                className="max-h-16 max-w-48 object-contain"
              />
            ) : null}
          </div>
          <div className="border-t border-zinc-400 pt-1.5 text-right">
            {company.signatoryName ? (
              <div className="font-medium">{company.signatoryName}</div>
            ) : null}
            <div className="text-zinc-600">{company.signatoryTitle || 'Authorised signatory'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

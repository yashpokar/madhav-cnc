'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/catalyst/table'
import { FormBanner } from '@/components/form-banner'
import { PLANS, type BillingPlan } from '@/lib/billing/plans'
import { setCompanyPlan } from '../../settings/billing/actions'

type Company = {
  id: string
  name: string
  plan: BillingPlan
  subscribedPlan: BillingPlan
  state: string
  source: string
  endsOn: string | null
  issued: number
  quota: number | null
}

const SOURCE: Record<string, string> = {
  SELF_SERVE: 'Paid online',
  GRANDFATHERED: 'Existing customer',
  MANUAL: 'Set by hand',
}

export function PlansManager({ companies }: { companies: Company[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [plan, setPlan] = useState<BillingPlan>('BUSINESS')
  const [reason, setReason] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function save(companyId: string) {
    startTransition(async () => {
      const result = await setCompanyPlan(companyId, plan, reason, endsOn)

      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })

      if (result.ok) {
        setEditing(null)
        setReason('')
        setEndsOn('')
        router.refresh()
      }
    })
  }

  return (
    <div className="grid gap-4">
      {message ? <FormBanner tone={message.ok ? 'success' : 'error'}>{message.text}</FormBanner> : null}
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Company</TableHeader>
              <TableHeader>Plan</TableHeader>
              <TableHeader>Invoices issued</TableHeader>
              <TableHeader>Ends</TableHeader>
              <TableHeader className="text-right">
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {PLANS[company.plan].name}
                    <Badge color={company.state === 'EXPIRED' ? 'red' : company.state === 'FREE' ? 'zinc' : 'lime'}>
                      {SOURCE[company.source] ?? company.source}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {company.issued}
                  {company.quota !== null ? ` of ${company.quota}` : ''}
                </TableCell>
                <TableCell>{company.endsOn ?? 'No end date'}</TableCell>
                <TableCell className="text-right">
                  {editing === company.id ? (
                    <div className="ml-auto grid max-w-xs gap-2 text-left">
                      <Select value={plan} onChange={(e) => setPlan(e.target.value as BillingPlan)} aria-label="Plan">
                        {Object.values(PLANS).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="date"
                        value={endsOn}
                        onChange={(e) => setEndsOn(e.target.value)}
                        aria-label="Ends on (blank for no end date)"
                      />
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (required)"
                        aria-label="Reason"
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => save(company.id)} disabled={pending}>
                          Save
                        </Button>
                        <Button plain onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      outline
                      onClick={() => {
                        setEditing(company.id)
                        setPlan(company.plan === 'FREE' ? 'BUSINESS' : company.plan)
                        setMessage(null)
                      }}
                    >
                      Set plan
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

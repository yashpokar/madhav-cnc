'use client'

import { PrinterIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <Button outline onClick={() => window.print()}>
      <PrinterIcon />
      {label}
    </Button>
  )
}

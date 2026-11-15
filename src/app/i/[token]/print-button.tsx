'use client'

import { PrinterIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'

export function PrintButton() {
  return (
    <Button outline onClick={() => window.print()}>
      <PrinterIcon />
      Print / Save as PDF
    </Button>
  )
}

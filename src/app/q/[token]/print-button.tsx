'use client'

import { ArrowDownTrayIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'

export function PrintButton() {
  return (
    <Button outline onClick={() => window.print()}>
      <ArrowDownTrayIcon />
      Save as PDF
    </Button>
  )
}

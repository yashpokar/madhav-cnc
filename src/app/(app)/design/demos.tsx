'use client'

import { useState } from 'react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/catalyst/alert'
import { Button } from '@/components/catalyst/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { notify } from '@/lib/toast'

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button outline onClick={() => notify.success('Invoice saved', 'INV-0042 was created.')}>
        Success toast
      </Button>
      <Button outline onClick={() => notify.error('Could not save', 'Check the highlighted fields.')}>
        Error toast
      </Button>
      <Button outline onClick={() => notify.info('Link copied')}>
        Neutral toast
      </Button>
    </div>
  )
}

export function DialogDemo() {
  const [dialog, setDialog] = useState(false)
  const [alert, setAlert] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setDialog(true)}>Open dialog</Button>
        <Button color="destructive" onClick={() => setAlert(true)}>
          Open alert
        </Button>
      </div>

      <Dialog open={dialog} onClose={setDialog}>
        <DialogTitle>Share this quotation</DialogTitle>
        <DialogDescription>The customer gets a link that works without signing in.</DialogDescription>
        <DialogBody>
          <p className="text-sm/6 text-zinc-600 dark:text-zinc-300">
            Dialogs sit on a blurred backdrop and scale in. Content scrolls inside the panel.
          </p>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDialog(false)}>
            Cancel
          </Button>
          <Button onClick={() => setDialog(false)}>Create link</Button>
        </DialogActions>
      </Dialog>

      <Alert open={alert} onClose={setAlert}>
        <AlertTitle>Delete this record?</AlertTitle>
        <AlertDescription>This cannot be undone.</AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setAlert(false)}>
            Keep it
          </Button>
          <Button color="destructive" onClick={() => setAlert(false)}>
            Delete
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false)

  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true)
        setTimeout(() => setLoading(false), 1800)
      }}
    >
      Save changes
    </Button>
  )
}

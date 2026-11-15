import { toast } from 'sonner'

/** A follow-up button on a toast: a link to the obvious next step. */
export type ToastAction = { label: string; href: string }

/** Event the app shell listens for so toast links navigate without a full reload. */
export const NAVIGATE_EVENT = 'app-navigate'

export function toastAction(action?: ToastAction) {
  if (!action) return undefined

  return {
    label: action.label,
    onClick: () => window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: action.href })),
  }
}

/**
 * Tiny wrapper so call sites do not import the toast library directly.
 * Use it from client components, after an action succeeds or fails.
 */
export const notify = {
  success: (message: string, description?: string, action?: ToastAction) =>
    toast.success(message, { description, action: toastAction(action) }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string, action?: ToastAction) =>
    toast(message, { description, action: toastAction(action) }),
}

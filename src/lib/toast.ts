import { toast } from 'sonner'

/**
 * Tiny wrapper so call sites do not import the toast library directly.
 * Use it from client components, after an action succeeds or fails.
 */
export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string) => toast(message, { description }),
}

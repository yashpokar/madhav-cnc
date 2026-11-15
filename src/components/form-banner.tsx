import { ToastOnMount } from '@/components/toast-on-mount'

function plainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plainText).join('')
  return ''
}

export function FormBanner({
  tone,
  children,
}: {
  tone: 'success' | 'error'
  children: React.ReactNode
}) {
  // Success banners also fire a toast, so the confirmation is seen even when
  // the banner has scrolled out of view. The banner itself stays.
  const message = tone === 'success' ? plainText(children).trim() : ''

  return (
    <div
      role="status"
      className={
        tone === 'success'
          ? 'rounded-xl bg-emerald-50 px-4 py-3 text-sm/6 text-emerald-900 ring-1 ring-emerald-950/10 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20'
          : 'rounded-xl bg-red-50 px-4 py-3 text-sm/6 text-red-900 ring-1 ring-red-950/10 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/20'
      }
    >
      {message ? <ToastOnMount message={message} /> : null}
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-950/15 bg-white/50 px-6 py-12 text-center dark:border-white/15 dark:bg-white/2.5">
      <div className="text-sm/6 font-medium text-zinc-950 dark:text-white">
        {title}
      </div>
      <div className="mx-auto mt-1 max-w-sm text-sm/6 text-zinc-500 dark:text-zinc-400">
        {description}
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

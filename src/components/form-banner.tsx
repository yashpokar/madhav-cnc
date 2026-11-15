import { ToastOnMount } from '@/components/toast-on-mount'

function plainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plainText).join('')
  return ''
}

export function FormBanner({
  tone,
  children,
  steps,
}: {
  tone: 'success' | 'error'
  children: React.ReactNode
  /** Obvious next steps after a save: links shown beside the message, the first also on the toast. */
  steps?: { label: string; href: string }[]
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
      {message ? <ToastOnMount message={message} action={steps?.[0]} /> : null}
      {steps && steps.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span>{children}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
            {steps.map((step) => (
              <a key={step.label} href={step.href} className="underline underline-offset-2 hover:no-underline">
                {step.label}
              </a>
            ))}
          </span>
        </div>
      ) : (
        children
      )}
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
    <div className="surface-card px-6 py-12 text-center">
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

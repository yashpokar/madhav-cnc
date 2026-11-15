import type React from 'react'
import { BrandMark } from '@/components/brand-mark'

const BENEFITS = [
  {
    title: 'One flow from quote to payment',
    body: 'Quotations become orders, orders become invoices, payments close them.',
  },
  {
    title: 'Every job visible, stage by stage',
    body: 'See what is in progress, what is waiting and what is ready to deliver.',
  },
  {
    title: 'Always know who owes what',
    body: 'Dues, receipts and reports stay current without a spreadsheet.',
  },
]

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5 shrink-0">
      <circle cx="10" cy="10" r="9" className="fill-white/10" />
      <path
        d="m6.5 10.3 2.3 2.3 4.7-4.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Split layout: a brand panel on large screens (always dark, so the accent
 * reads the same in both themes) and the form on a clean card. On phones only
 * the card shows.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper dark:bg-zinc-950 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        data-theme="dark"
        className="relative isolate hidden overflow-hidden bg-accent-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      >
        {/* Soft accent glow and a faint grid; decoration only. */}
        <div
          aria-hidden="true"
          className="absolute -top-40 -left-24 -z-10 size-[34rem] rounded-full bg-accent-600/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />

        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <span className="text-lg/6 font-semibold tracking-tight">prodlys</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-4xl/[1.1] font-semibold tracking-tight text-balance xl:text-5xl/[1.08]">
            Run your whole business in one place
          </h2>
          <ul className="mt-10 grid gap-6">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex gap-3 text-accent-200">
                <CheckIcon />
                <div>
                  <div className="text-sm/6 font-semibold text-white">{benefit.title}</div>
                  <div className="text-sm/6 text-accent-200/90">{benefit.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs/5 text-accent-300/80">
          Built for workshops, studios, salons, caterers, hotels and more.
        </p>
      </aside>

      <div className="flex min-h-dvh items-center justify-center p-4 sm:p-8 lg:min-h-0 lg:p-12">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-card sm:p-10 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-white/10 dark:lg:bg-transparent dark:lg:ring-0">
          <div className="mx-auto flex w-full justify-center">{children}</div>
        </div>
      </div>
    </main>
  )
}

import type { Action, Resource } from '@/lib/permissions'

type Cap = `${Resource}:${Action}`

/** What the page currently offers for one tour target. */
export type TargetProbe = {
  /** `visible`: on screen. `hidden`: in the DOM but not shown (e.g. the sidebar on a phone). */
  state: 'visible' | 'hidden' | 'missing'
  /** The element's own text, so copy can use whatever the nav actually calls it. */
  label?: string
}

export type TourContext = {
  can: (capability: Cap) => boolean
  /** Looks up the first usable element for a data-tour value. */
  probe: (target: string) => TargetProbe
  /** Below the `lg` breakpoint: the sidebar is a drawer, so its items are not on screen. */
  mobile: boolean
}

type CopyContext = { label: string; can: (capability: Cap) => boolean }

export type TourStepDef = {
  id: string
  /** data-tour values, in order of preference; the first one present is used. */
  targets: readonly string[]
  /** Hide the step entirely when the user lacks this capability. */
  requires?: Cap
  title: string
  body: (copy: CopyContext) => string
}

export type ResolvedStep = {
  id: string
  title: string
  body: string
  /** The data-tour value to spotlight, or null for a centered card with no spotlight. */
  target: string | null
}

export const MAX_STEPS = 8

const quote = (label: string) => (label ? `“${label}”` : 'this section')

export const TOUR_STEPS: readonly TourStepDef[] = [
  {
    id: 'company',
    targets: ['company-switcher'],
    title: 'Welcome to your workspace',
    body: () =>
      'Everything you see belongs to the business shown here. If you work with more than one, this is where you switch. A quick look around takes under a minute.',
  },
  {
    id: 'search',
    targets: ['search'],
    title: 'Find anything fast',
    body: () =>
      'Search jumps straight to a page, a customer or a record. On a keyboard, press Ctrl or ⌘ and K from anywhere.',
  },
  {
    id: 'create',
    targets: ['create-menu'],
    title: 'Start something new',
    body: () =>
      'The Create menu is the quickest way to add a new record. It only lists what your role is allowed to create.',
  },
  {
    id: 'sell',
    targets: ['nav:/orders', 'nav:/quotations'],
    title: 'Your work',
    body: ({ label, can }) =>
      can('order:create') || can('quotation:create')
        ? `${quote(label)} is where your work is planned and tracked, from the first enquiry to the finished job.`
        : `${quote(label)} shows the work in progress, so you always know what is coming up and what is done.`,
  },
  {
    id: 'money',
    targets: ['nav:/invoices', 'nav:/payments'],
    title: 'Money in and out',
    body: ({ label, can }) =>
      can('invoice:create') || can('payment:create')
        ? `${quote(label)} is where you bill customers and record what you have been paid.`
        : `${quote(label)} lets you see what has been billed and what is still to be collected.`,
  },
  {
    id: 'people',
    targets: ['nav:/customers', 'nav:/items'],
    title: 'People and what you offer',
    body: ({ label }) =>
      `${quote(label)} keeps the people you work with and the things you offer in one tidy place, ready to pick whenever you need them.`,
  },
  {
    id: 'settings',
    targets: ['nav:/settings/company', 'nav:/settings/payment-modes'],
    requires: 'settings:update',
    title: 'Make it yours',
    body: ({ label }) =>
      `Start with ${quote(label)} to add your business name, address and logo, and set up how you get paid. Customers see these on every document.`,
  },
  {
    id: 'account',
    targets: ['account-menu'],
    title: 'Your account',
    body: () =>
      'Change your theme, update your details or sign out here. You can also choose “Take the tour” in this menu any time to see this again.',
  },
]

const MOBILE_HINT = ' Open the menu at the top left to find it.'

/**
 * Decides which steps this person actually gets, in order.
 * A step is dropped when the role cannot use it or its target is not on the page;
 * on a phone, a step whose target is tucked in the drawer becomes a centered card.
 */
export function resolveSteps(ctx: TourContext, defs: readonly TourStepDef[] = TOUR_STEPS): ResolvedStep[] {
  const out: ResolvedStep[] = []

  for (const def of defs) {
    if (def.requires && !ctx.can(def.requires)) continue

    let chosen: { target: string; probe: TargetProbe } | null = null
    let hiddenFallback: { target: string; probe: TargetProbe } | null = null

    for (const target of def.targets) {
      const probe = ctx.probe(target)
      if (probe.state === 'visible') {
        chosen = { target, probe }
        break
      }
      if (probe.state === 'hidden' && !hiddenFallback) hiddenFallback = { target, probe }
    }

    if (chosen) {
      out.push({
        id: def.id,
        title: def.title,
        body: def.body({ label: chosen.probe.label ?? '', can: ctx.can }),
        target: chosen.target,
      })
    } else if (hiddenFallback && ctx.mobile) {
      out.push({
        id: def.id,
        title: def.title,
        body: def.body({ label: hiddenFallback.probe.label ?? '', can: ctx.can }) + MOBILE_HINT,
        target: null,
      })
    }
    // Otherwise the target does not exist for this user: skip the step.
  }

  return out.slice(0, MAX_STEPS)
}

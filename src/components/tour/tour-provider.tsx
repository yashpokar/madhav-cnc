'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { UserRole } from '@/generated/prisma/enums'
import { can } from '@/lib/permissions'
import { TourPopover } from './tour-popover'
import { readTourState, writeTourState } from './storage'
import { resolveSteps, type ResolvedStep, type TargetProbe } from './steps'

type TourApi = {
  /** Starts the tour now, taking the person to the dashboard first if they are elsewhere. */
  start: () => void
}

const TourContext = createContext<TourApi>({ start: () => {} })

export const useTour = () => useContext(TourContext)

const selectorFor = (target: string) => `[data-tour="${target.replace(/["\\]/g, '\\$&')}"]`

function isShown(el: Element) {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const labelOf = (el: Element) =>
  (el.textContent ?? '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || undefined

/** First on-screen element for a data-tour value (a value may exist in both the sidebar and the phone header). */
export function findTourTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selectorFor(target))) {
    if (isShown(el)) return el
  }
  return null
}

function probeDom(target: string): TargetProbe {
  const all = Array.from(document.querySelectorAll(selectorFor(target)))
  const shown = all.find(isShown)
  if (shown) return { state: 'visible', label: labelOf(shown) }
  if (all.length > 0) return { state: 'hidden', label: labelOf(all[0]) }
  return { state: 'missing' }
}

export function TourProvider({
  userId,
  companyId,
  role,
  children,
}: {
  userId: string
  companyId: string | null
  role: UserRole
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [steps, setSteps] = useState<ResolvedStep[] | null>(null)
  const [index, setIndex] = useState(0)
  const [wantsStart, setWantsStart] = useState(false)
  const autoTried = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  const run = useCallback(() => {
    const mobile = window.matchMedia('(max-width: 1023px)').matches
    const resolved = resolveSteps({ can: (capability) => can(role, capability), probe: probeDom, mobile })

    if (resolved.length === 0) return

    const active = document.activeElement
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null
    setIndex(0)
    setSteps(resolved)
  }, [role])

  const start = useCallback(() => {
    setWantsStart(true)
    if (pathname !== '/') router.push('/')
  }, [pathname, router])

  // A requested start waits until the dashboard is showing, then lets menus finish closing.
  useEffect(() => {
    if (!wantsStart || pathname !== '/') return

    const timer = window.setTimeout(() => {
      setWantsStart(false)
      run()
    }, 350)

    return () => window.clearTimeout(timer)
  }, [wantsStart, pathname, run])

  // First visit to the dashboard for this person in this company. Never elsewhere, never mid-task.
  useEffect(() => {
    if (autoTried.current || pathname !== '/' || !companyId) return

    // Storage unavailable (undefined) means we could not remember it was shown, so do not auto-start.
    if (readTourState(userId, companyId) !== null) {
      autoTried.current = true
      return
    }

    const timer = window.setTimeout(() => {
      autoTried.current = true
      // Mark it seen right away so a reload mid-tour does not replay it.
      writeTourState(userId, companyId, 'skipped')
      run()
    }, 900)

    return () => window.clearTimeout(timer)
  }, [pathname, userId, companyId, run])

  const close = useCallback(
    (outcome: 'done' | 'skipped') => {
      if (companyId) writeTourState(userId, companyId, outcome)
      setSteps(null)
      const el = returnFocus.current
      returnFocus.current = null
      // Wait a tick so the popover is gone before focus moves back.
      window.setTimeout(() => el?.isConnected && el.focus(), 0)
    },
    [userId, companyId],
  )

  const api = useMemo(() => ({ start }), [start])

  return (
    <TourContext.Provider value={api}>
      {children}
      {steps ? (
        <TourPopover
          steps={steps}
          index={index}
          onIndex={setIndex}
          onClose={close}
        />
      ) : null}
    </TourContext.Provider>
  )
}

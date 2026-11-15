'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResolvedStep } from './steps'
import { findTourTarget } from './tour-provider'

const GAP = 14
const PAD = 6
const MARGIN = 12

type Placement = { top: number; left: number; spot: { top: number; left: number; width: number; height: number } | null }

function place(target: HTMLElement | null, card: HTMLElement | null): Placement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = card?.offsetWidth ?? 320
  const h = card?.offsetHeight ?? 200

  if (!target) {
    return { top: Math.max(MARGIN, (vh - h) / 2), left: Math.max(MARGIN, (vw - w) / 2), spot: null }
  }

  const r = target.getBoundingClientRect()
  const spot = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
  const clampLeft = (x: number) => Math.min(Math.max(MARGIN, x), vw - w - MARGIN)
  const clampTop = (y: number) => Math.min(Math.max(MARGIN, y), vh - h - MARGIN)

  if (r.right + GAP + w + MARGIN <= vw) {
    return { top: clampTop(r.top + r.height / 2 - h / 2), left: r.right + GAP + PAD, spot }
  }
  if (r.bottom + GAP + h + MARGIN <= vh) {
    return { top: r.bottom + GAP + PAD, left: clampLeft(r.left + r.width / 2 - w / 2), spot }
  }
  if (r.top - GAP - h - MARGIN >= 0) {
    return { top: r.top - GAP - PAD - h, left: clampLeft(r.left + r.width / 2 - w / 2), spot }
  }
  return { top: clampTop((vh - h) / 2), left: clampLeft((vw - w) / 2), spot }
}

export function TourPopover({
  steps,
  index,
  onIndex,
  onClose,
}: {
  steps: ResolvedStep[]
  index: number
  onIndex: (index: number) => void
  onClose: (outcome: 'done' | 'skipped') => void
}) {
  const step = steps[index]
  const last = index === steps.length - 1
  const titleId = useId()
  const bodyId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const reposition = useCallback(() => {
    const target = step.target ? findTourTarget(step.target) : null
    setPlacement(place(target, cardRef.current))
  }, [step])

  // Bring the target into view, then measure. Instant scroll when motion should be reduced.
  useLayoutEffect(() => {
    const target = step.target ? findTourTarget(step.target) : null
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    reposition()
    // Smooth scrolling moves the target after the first measurement; re-measure shortly after.
    const timer = window.setTimeout(reposition, reduce ? 0 : 350)
    return () => window.clearTimeout(timer)
  }, [step, reposition])

  useEffect(() => {
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [reposition])

  // Keep the keyboard on the primary action as steps change.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose('skipped')
        return
      }

      if (event.key !== 'Tab') return

      const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!cardRef.current?.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const spot = placement?.spot ?? null

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Blocks clicks on the page behind the tour. */}
      <div className="absolute inset-0" aria-hidden="true" />

      {spot ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl shadow-[0_0_0_9999px_rgba(9,9,11,0.62)] ring-2 ring-white/90 transition-[top,left,width,height] duration-200 motion-reduce:transition-none dark:shadow-[0_0_0_9999px_rgba(0,0,0,0.72)]"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-zinc-950/60 dark:bg-black/70" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="fixed w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-white p-5 text-zinc-950 shadow-xl ring-1 ring-zinc-950/10 transition-[top,left,opacity] duration-200 motion-reduce:transition-none dark:bg-zinc-900 dark:text-white dark:ring-white/10"
        style={{
          top: placement?.top ?? 0,
          left: placement?.left ?? 0,
          opacity: placement ? 1 : 0,
        }}
      >
        <p className="text-xs/5 font-medium text-zinc-500 dark:text-zinc-400">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="mt-1 text-base/6 font-semibold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm/6 text-zinc-600 dark:text-zinc-300">
          {step.body}
        </p>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
                i === index
                  ? 'w-4 bg-zinc-950 dark:bg-white'
                  : 'w-1.5 bg-zinc-950/20 dark:bg-white/25'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onClose('skipped')}
            className="rounded-lg px-2 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => onIndex(index - 1)}
                className="rounded-lg px-3 py-1.5 text-sm/5 font-medium text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-white dark:ring-white/20 dark:hover:bg-white/10"
              >
                Back
              </button>
            ) : null}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? onClose('done') : onIndex(index + 1))}
              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm/5 font-medium text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

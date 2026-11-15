'use client'

import {
  BuildingOffice2Icon,
  CakeIcon,
  CameraIcon,
  PaintBrushIcon,
  ScissorsIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/20/solid'
import clsx from 'clsx'
import type { ComponentType, SVGProps } from 'react'
import { INDUSTRY_LIST, type IndustryIcon, type IndustryKey } from '@/lib/industry'

export const INDUSTRY_ICONS: Record<IndustryIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  WrenchScrewdriverIcon,
  PaintBrushIcon,
  CameraIcon,
  ScissorsIcon,
  BuildingOffice2Icon,
  CakeIcon,
  Squares2X2Icon,
}

/**
 * Selectable cards with radio semantics: native radio inputs inside a
 * fieldset, so arrow keys, Tab and screen readers behave as expected.
 */
export function IndustryPicker({
  value,
  onChange,
  name = 'industry',
}: {
  value: IndustryKey | null
  onChange: (value: IndustryKey) => void
  name?: string
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-3">
      <legend className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
        What does your company do?
      </legend>
      <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
        We use this to set up sensible units, stages and expense categories. You can change all of them later.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INDUSTRY_LIST.map((industry) => {
          const Icon = INDUSTRY_ICONS[industry.icon]
          const selected = value === industry.key

          return (
            <label
              key={industry.key}
              className={clsx(
                'relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-500',
                selected
                  ? 'border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                  : 'border-zinc-950/10 hover:border-zinc-950/25 dark:border-white/15 dark:hover:border-white/30',
              )}
            >
              <input
                type="radio"
                name={name}
                value={industry.key}
                checked={selected}
                onChange={() => onChange(industry.key)}
                className="sr-only"
              />
              <Icon
                aria-hidden="true"
                className={clsx('mt-0.5 size-5 shrink-0', selected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500')}
              />
              <span className="grid gap-0.5">
                <span className="text-sm/6 font-medium text-zinc-950 dark:text-white">{industry.label}</span>
                <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">{industry.description}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

import { CheckIcon, ChevronDownIcon, FunnelIcon } from '@heroicons/react/16/solid'
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'

type Params = Record<string, string | string[] | undefined>

/**
 * A single-choice filter as a dropdown (status, type, view). The choice lives
 * in the URL, so it can be shared and survives a refresh. Every other
 * parameter is kept; only the page number resets.
 */
export function StatusFilter({
  label = 'Status',
  options,
  value,
  params,
  pathname,
  paramKey = 'tab',
  defaultValue = 'all',
}: {
  label?: string
  options: { value: string; label: string; count?: number }[]
  /** The selected option's value. */
  value: string
  params: Params
  pathname: string
  paramKey?: string
  /** The option that means "no filter"; it is left out of the URL. */
  defaultValue?: string
}) {
  const selected = options.find((option) => option.value === value) ?? options[0]

  const hrefFor = (next: string) => {
    const query = new URLSearchParams()

    for (const [key, entry] of Object.entries(params)) {
      const single = Array.isArray(entry) ? entry[0] : entry
      if (single !== undefined && key !== paramKey && key !== 'page') query.set(key, single)
    }

    if (next !== defaultValue) query.set(paramKey, next)

    return query.toString() ? `${pathname}?${query}` : pathname
  }

  const filtered = selected.value !== defaultValue

  return (
    <Dropdown>
      <DropdownButton outline className="min-w-52 justify-between whitespace-nowrap">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <FunnelIcon aria-hidden="true" className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
          <span className={filtered ? 'font-semibold' : 'font-medium'}>{selected.label}</span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="min-w-56">
        {options.map((option) => (
          <DropdownItem key={option.value} href={hrefFor(option.value)}>
            {option.value === selected.value ? (
              <CheckIcon data-slot="icon" />
            ) : (
              <span data-slot="icon" aria-hidden="true" />
            )}
            <DropdownLabel>{option.label}</DropdownLabel>
            {option.count !== undefined ? (
              <span className="col-start-5 text-xs/5 text-zinc-500 tabular-nums group-data-focus:text-white dark:text-zinc-400">
                {option.count}
              </span>
            ) : null}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}

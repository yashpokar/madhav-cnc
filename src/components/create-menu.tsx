'use client'

import {
  BanknotesIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  CurrencyRupeeIcon,
  DocumentTextIcon,
  PlusIcon,
  TruckIcon,
} from '@heroicons/react/16/solid'
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'

export const CREATE_ACTIONS = {
  quotation: { href: '/quotations/new', label: 'Quotation', hint: 'Price a job for a customer', icon: DocumentTextIcon, group: 'sell' },
  order: { href: '/orders/new', label: 'Order', hint: 'Confirmed work to produce', icon: ClipboardDocumentListIcon, group: 'sell' },
  challan: { href: '/dispatch/new', label: 'Delivery challan', hint: 'Goods leaving the workshop', icon: TruckIcon, group: 'sell' },
  invoice: { href: '/invoices/new', label: 'Invoice', hint: 'Bill a customer', icon: BanknotesIcon, group: 'money' },
  receipt: { href: '/payments/new', label: 'Receipt', hint: 'Money received from a customer', icon: CurrencyRupeeIcon, group: 'money' },
  expense: { href: '/expenses/new', label: 'Expense', hint: 'A bill or payment to a vendor', icon: CreditCardIcon, group: 'money' },
  customer: { href: '/customers/new', label: 'Customer', hint: 'Someone you sell to', icon: BuildingOffice2Icon, group: 'people' },
} as const

export type CreateAction = keyof typeof CREATE_ACTIONS

/** The capability each Create action needs; mirrors what the dashboard checks. */
export const CREATE_CAPABILITIES = {
  quotation: 'quotation:create',
  order: 'order:create',
  challan: 'dispatch:create',
  invoice: 'invoice:create',
  receipt: 'payment:create',
  expense: 'expense:create',
  customer: 'customer:create',
} as const satisfies Record<CreateAction, `${string}:create`>

/** One "Create" button that opens every new-record shortcut the user may use. */
export function CreateMenu({ allowed }: { allowed: CreateAction[] }) {
  if (allowed.length === 0) return null

  const groups = (['sell', 'money', 'people'] as const)
    .map((group) => allowed.filter((key) => CREATE_ACTIONS[key].group === group))
    .filter((keys) => keys.length > 0)

  return (
    <Dropdown>
      <DropdownButton data-tour="create-menu">
        <PlusIcon />
        Create
        <kbd className="hidden rounded px-1 font-sans text-xs/5 ring-1 ring-current/30 sm:inline">C</kbd>
        <ChevronDownIcon />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="min-w-72">
        {groups.map((keys, index) => (
          <div key={keys[0]} className="contents">
            {index > 0 ? <DropdownDivider /> : null}
            {keys.map((key) => {
              const action = CREATE_ACTIONS[key]
              const Icon = action.icon

              return (
                <DropdownItem key={key} href={action.href}>
                  <Icon data-slot="icon" />
                  <DropdownLabel>{action.label}</DropdownLabel>
                  <DropdownDescription>{action.hint}</DropdownDescription>
                </DropdownItem>
              )
            })}
          </div>
        ))}
        <DropdownDivider />
        <p className="px-3.5 py-1.5 text-xs/5 text-zinc-500 sm:px-3 dark:text-zinc-400">
          Press <kbd className="rounded bg-zinc-100 px-1 font-sans dark:bg-white/10">C</kbd> anywhere, or{' '}
          <kbd className="rounded bg-zinc-100 px-1 font-sans dark:bg-white/10">?</kbd> for all shortcuts
        </p>
      </DropdownMenu>
    </Dropdown>
  )
}

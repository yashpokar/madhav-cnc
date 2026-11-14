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

/** One "Create" button that opens every new-record shortcut the user may use. */
export function CreateMenu({ allowed }: { allowed: CreateAction[] }) {
  if (allowed.length === 0) return null

  const groups = (['sell', 'money', 'people'] as const)
    .map((group) => allowed.filter((key) => CREATE_ACTIONS[key].group === group))
    .filter((keys) => keys.length > 0)

  return (
    <Dropdown>
      <DropdownButton>
        <PlusIcon />
        Create
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
      </DropdownMenu>
    </Dropdown>
  )
}

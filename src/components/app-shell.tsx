'use client'

import { BrandMark, Wordmark } from '@/components/brand-mark'
import { usePathname } from 'next/navigation'
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClockIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  MapIcon,
  SunIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CurrencyRupeeIcon,
  CubeIcon,
  DocumentChartBarIcon,
  DocumentTextIcon,
  HomeIcon,
  ReceiptPercentIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TruckIcon,
  UserGroupIcon,
  UsersIcon,
  ScaleIcon,
  WalletIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/20/solid'
import { Avatar } from '@/components/catalyst/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'
import { Navbar, NavbarSection, NavbarSpacer } from '@/components/catalyst/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/catalyst/sidebar'
import { SidebarLayout } from '@/components/catalyst/sidebar-layout'
import { CompanySwitcher, type CompanyChoice } from '@/components/company-switcher'
import { CommandPalette, SearchTrigger } from '@/components/command-palette'
import { Shortcuts } from '@/components/shortcuts'
import { setTheme } from '@/lib/theme'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import type { NavEntry } from '@/lib/navigation'
import type { CurrentUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { TourProvider, useTour } from '@/components/tour/tour-provider'

const GROUP_ORDER = ['Overview', 'Sell', 'Buy', 'Money', 'People', 'Catalogue'] as const

const ICONS: Record<string, typeof HomeIcon> = {
  '/': HomeIcon,
  '/customers': BuildingOffice2Icon,
  '/partners': UserGroupIcon,
  '/items': CubeIcon,
  '/quotations': DocumentTextIcon,
  '/orders': ClipboardDocumentListIcon,
  '/calendar': CalendarDaysIcon,
  '/statement': DocumentChartBarIcon,
  '/production': WrenchScrewdriverIcon,
  '/dispatch': TruckIcon,
  '/purchase-orders': ShoppingCartIcon,
  '/purchase-bills': ReceiptPercentIcon,
  '/invoices': BanknotesIcon,
  '/payments': CurrencyRupeeIcon,
  '/notes': ArrowsRightLeftIcon,
  '/expenses': CreditCardIcon,
  '/vendors': ShoppingBagIcon,
  '/reports': ChartBarIcon,
  '/admin/users': UsersIcon,
  '/admin/companies': BuildingOfficeIcon,
  '/admin/activity': ClockIcon,
  '/settings/company': BuildingStorefrontIcon,
  '/settings/payment-modes': WalletIcon,
  '/settings/opening-balances': ScaleIcon,
}

function isCurrent(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/'
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell(props: Parameters<typeof AppShellFrame>[0]) {
  return (
    <TourProvider userId={props.user.id} companyId={props.activeCompanyId} role={props.user.role}>
      <AppShellFrame {...props} />
    </TourProvider>
  )
}

function AppShellFrame({
  user,
  nav,
  adminNav,
  companies,
  activeCompanyId,
  children,
}: {
  user: CurrentUser
  nav: readonly NavEntry[]
  adminNav: readonly NavEntry[]
  companies: CompanyChoice[]
  activeCompanyId: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { start: startTour } = useTour()

  async function signOut() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  const accountDropdown = (
    <DropdownMenu className="min-w-56" anchor="bottom start">
      <DropdownItem href="/account">
        <Cog6ToothIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={startTour}>
        <MapIcon />
        <DropdownLabel>Take the tour</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={() => setTheme('light')}>
        <SunIcon />
        <DropdownLabel>Light theme</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={() => setTheme('dark')}>
        <MoonIcon />
        <DropdownLabel>Dark theme</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={() => setTheme('system')}>
        <ComputerDesktopIcon />
        <DropdownLabel>Match device</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={signOut}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <SearchTrigger data-tour="search" className="flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/10" />
            <Dropdown>
              <DropdownButton as="button" data-tour="account-menu" className="cursor-pointer">
                <Avatar
                  src={user.image}
                  initials={user.image ? undefined : initialsOf(user.name)}
                  className="size-8"
                  square
                  alt=""
                />
              </DropdownButton>
              {accountDropdown}
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="mb-3 flex items-center gap-2 px-0.5 max-lg:hidden">
              <BrandMark className="size-6" />
              <Wordmark className="text-sm/6" />
            </div>
            <div data-tour="company-switcher">
              <CompanySwitcher
                companies={companies}
                activeId={activeCompanyId}
                canManage={user.isSuperAdmin}
                roleLabel={user.isSuperAdmin ? 'Platform admin' : ROLE_LABELS[user.role]}
              />
            </div>
            <button
              type="button"
              data-tour="search"
              onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
              className="mt-3 flex w-full items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-2 text-sm/6 text-zinc-500 ring-1 ring-zinc-950/8 transition-colors hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/10"
            >
              <MagnifyingGlassIcon className="size-4" aria-hidden="true" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="font-sans text-xs/5">⌘K</kbd>
            </button>
          </SidebarHeader>

          <SidebarBody>
            {GROUP_ORDER.map((group) => {
              const entries = nav.filter((entry) => entry.group === group)

              if (entries.length === 0) return null

              return (
                <SidebarSection key={group} className={group === 'Overview' ? undefined : 'mt-4'}>
                  {group === 'Overview' ? null : <SidebarHeading>{group}</SidebarHeading>}
                  {entries.map((entry) => {
                    const Icon = ICONS[entry.href]

                    return (
                      <SidebarItem
                        key={entry.href}
                        href={entry.href}
                        data-tour={`nav:${entry.href}`}
                        current={isCurrent(pathname, entry.href)}
                      >
                        {Icon ? <Icon /> : null}
                        <SidebarLabel>{entry.label}</SidebarLabel>
                      </SidebarItem>
                    )
                  })}
                </SidebarSection>
              )
            })}

            {(['Administration', 'Settings'] as const).map((group) => {
              const entries = adminNav.filter((entry) => entry.group === group)

              if (entries.length === 0) return null

              return (
                <SidebarSection key={group} className="mt-6">
                  <SidebarHeading>{group}</SidebarHeading>
                  {entries.map((entry) => {
                    const Icon = ICONS[entry.href]

                    return (
                      <SidebarItem
                        key={entry.href}
                        href={entry.href}
                        data-tour={`nav:${entry.href}`}
                        current={isCurrent(pathname, entry.href)}
                      >
                        {Icon ? <Icon /> : null}
                        <SidebarLabel>{entry.label}</SidebarLabel>
                      </SidebarItem>
                    )
                  })}
                </SidebarSection>
              )
            })}

            <SidebarSpacer />
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem} data-tour="account-menu">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={user.image}
                    initials={user.image ? undefined : initialsOf(user.name)}
                    className="size-10"
                    square
                    alt=""
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </span>
                </span>
                <ChevronDownIcon />
              </DropdownButton>
              {accountDropdown}
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      <CommandPalette pages={[...nav, ...adminNav]} />
      <Shortcuts userId={user.id} companyId={activeCompanyId} role={user.role} nav={nav} />
      {children}
      <BottomNav nav={nav} pathname={pathname} />
    </SidebarLayout>
  )
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const BOTTOM_LABELS: Record<string, string> = { '/': 'Home' }

const BOTTOM_PRIORITY = ['/', '/orders', '/production', '/quotations', '/invoices', '/dispatch', '/customers']

function BottomNav({
  nav,
  pathname,
}: {
  nav: readonly NavEntry[]
  pathname: string
}) {
  const entries = BOTTOM_PRIORITY.map((href) =>
    nav.find((entry) => entry.href === href),
  )
    .filter((entry): entry is NavEntry => Boolean(entry))
    .slice(0, 4)

  if (entries.length < 2) {
    return null
  }

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar. */}
      <div aria-hidden="true" className="h-14 lg:hidden print:hidden" />
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-950/8 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden dark:border-white/10 dark:bg-zinc-900/95"
      >
        {entries.map((entry) => {
          const Icon = ICONS[entry.href]
          const current = isCurrent(pathname, entry.href)

          return (
            <Link
              key={entry.href}
              href={entry.href}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]/4 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 ${
                current
                  ? 'text-accent-700 dark:text-accent-300'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
              <span className="truncate">{BOTTOM_LABELS[entry.href] ?? entry.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

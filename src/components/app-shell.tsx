'use client'

import { usePathname } from 'next/navigation'
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CurrencyRupeeIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  TruckIcon,
  UserGroupIcon,
  UsersIcon,
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
import { BrandLockup } from '@/components/brand-mark'
import { CommandPalette, SearchTrigger } from '@/components/command-palette'
import { setTheme } from '@/lib/theme'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import type { NavEntry } from '@/lib/navigation'
import type { CurrentUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'

const ICONS: Record<string, typeof HomeIcon> = {
  '/': HomeIcon,
  '/customers': BuildingOffice2Icon,
  '/partners': UserGroupIcon,
  '/items': CubeIcon,
  '/quotations': DocumentTextIcon,
  '/orders': ClipboardDocumentListIcon,
  '/production': WrenchScrewdriverIcon,
  '/dispatch': TruckIcon,
  '/invoices': BanknotesIcon,
  '/payments': CurrencyRupeeIcon,
  '/notes': ArrowsRightLeftIcon,
  '/expenses': CreditCardIcon,
  '/reports': ChartBarIcon,
  '/admin/users': UsersIcon,
  '/settings/company': BuildingStorefrontIcon,
}

function isCurrent(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/'
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({
  user,
  nav,
  adminNav,
  children,
}: {
  user: CurrentUser
  nav: readonly NavEntry[]
  adminNav: readonly NavEntry[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

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
      {adminNav.length > 0 ? (
        <>
          <DropdownDivider />
          <DropdownItem href="/admin/users">
            <UsersIcon />
            <DropdownLabel>Manage users</DropdownLabel>
          </DropdownItem>
        </>
      ) : null}
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
            <SearchTrigger className="flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/10" />
            <Dropdown>
              <DropdownButton as="button" className="cursor-pointer">
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
            <BrandLockup subtitle="Order management" />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm/6 text-zinc-500 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5"
            >
              <MagnifyingGlassIcon className="size-4" aria-hidden="true" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="font-sans text-xs/5">⌘K</kbd>
            </button>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {nav.map((entry) => {
                const Icon = ICONS[entry.href]

                return (
                  <SidebarItem
                    key={entry.href}
                    href={entry.href}
                    current={isCurrent(pathname, entry.href)}
                  >
                    {Icon ? <Icon /> : null}
                    <SidebarLabel>{entry.label}</SidebarLabel>
                  </SidebarItem>
                )
              })}
            </SidebarSection>

            {adminNav.length > 0 ? (
              <SidebarSection className="mt-6">
                <SidebarHeading>Administration</SidebarHeading>
                {adminNav.map((entry) => {
                  const Icon = ICONS[entry.href]

                  return (
                    <SidebarItem
                      key={entry.href}
                      href={entry.href}
                      current={isCurrent(pathname, entry.href)}
                    >
                      {Icon ? <Icon /> : null}
                      <SidebarLabel>{entry.label}</SidebarLabel>
                    </SidebarItem>
                  )
                })}
              </SidebarSection>
            ) : null}

            <SidebarSpacer />
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem}>
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
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-950/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden dark:border-white/10 dark:bg-zinc-900/95"
      >
        {entries.map((entry) => {
          const Icon = ICONS[entry.href]
          const current = isCurrent(pathname, entry.href)

          return (
            <Link
              key={entry.href}
              href={entry.href}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]/4 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 ${
                current
                  ? 'text-zinc-950 dark:text-gold-300'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
              <span className="truncate">{entry.label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

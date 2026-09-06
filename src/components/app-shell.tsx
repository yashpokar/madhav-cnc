'use client'

import { usePathname } from 'next/navigation'
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
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
  '/notes': ArrowsRightLeftIcon,
  '/expenses': CreditCardIcon,
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
      {children}
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

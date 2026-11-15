import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox'
import { Description, ErrorMessage, Field, Label } from '@/components/catalyst/fieldset'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Input } from '@/components/catalyst/input'
import { Radio, RadioField, RadioGroup } from '@/components/catalyst/radio'
import { Select } from '@/components/catalyst/select'
import { Switch, SwitchField } from '@/components/catalyst/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { Skeleton, SkeletonTable } from '@/components/skeleton'
import { requireSuperAdmin } from '@/lib/session'
import { DialogDemo, LoadingButtonDemo, ToastDemo } from './demos'

export const metadata: Metadata = { title: 'Design system' }

const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

const BADGES = ['zinc', 'indigo', 'green', 'amber', 'red', 'sky', 'teal', 'orange'] as const

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4">
      <div>
        <Subheading>{title}</Subheading>
        {note ? <Text className="mt-1 max-w-prose">{note}</Text> : null}
      </div>
      <div className="grid gap-4 rounded-xl bg-white p-5 shadow-card sm:p-6 dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-white/10">
        {children}
      </div>
    </section>
  )
}

export default async function DesignPage() {
  await requireSuperAdmin()

  return (
    <div className="grid max-w-5xl gap-10">
      <div>
        <Heading>Design system</Heading>
        <Text className="mt-1 max-w-prose">
          The components and tokens every page is built from. Switch the theme from the account
          menu to review light and dark. Colours are CSS variables in globals.css, so a company
          accent can replace the --accent-* scale without touching a component.
        </Text>
      </div>

      <Section
        title="Accent scale"
        note="Override --accent-50 to --accent-950 to re-theme. 600 is the button fill (white text, 6.3:1). 500 is the focus ring."
      >
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {ACCENT_STEPS.map((step) => (
            <div key={step} className="grid gap-1.5">
              <div
                className="h-12 rounded-lg ring-1 ring-black/5"
                style={{ background: `var(--accent-${step})` }}
              />
              <div className="text-xs/4 text-zinc-500 tabular-nums dark:text-zinc-400">{step}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Neutrals" note="Cool slate. Text is 700 to 950, borders are hairlines at 5 to 10 percent.">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {NEUTRAL_STEPS.map((step) => (
            <div key={step} className="grid gap-1.5">
              <div
                className="h-12 rounded-lg ring-1 ring-black/5"
                style={{ background: `var(--color-zinc-${step})` }}
              />
              <div className="text-xs/4 text-zinc-500 tabular-nums dark:text-zinc-400">{step}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm/6">
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
            Money in
          </span>
          <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-800 dark:bg-red-400/10 dark:text-red-300">
            Money out / due
          </span>
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-300">
            Needs attention
          </span>
        </div>
      </Section>

      <Section title="Type" note="Inter, tight tracking on headings, tabular figures for money.">
        <div className="grid gap-1">
          <div className="text-3xl/10 font-semibold tracking-tight">Heading 30</div>
          <div className="text-xl/8 font-semibold tracking-tight">Heading 20</div>
          <div className="text-base/7 font-semibold tracking-tight">Subheading 16</div>
          <div className="text-sm/6">Body 14. Quotations become orders, orders become invoices.</div>
          <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">Secondary 14. Updated 3 days ago.</div>
          <div className="text-sm/6 tabular-nums">1,234,567.00 / 9,876.50 / 111.11</div>
        </div>
      </Section>

      <Section title="Buttons" note="Primary is the accent. Heights: small 32px, default 40px, large 48px.">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button outline>Outline</Button>
          <Button plain>Plain</Button>
          <Button color="destructive">Destructive</Button>
          <Button color="green">Confirm</Button>
          <Button disabled>Disabled</Button>
          <LoadingButtonDemo />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="sm" outline>
            Small outline
          </Button>
        </div>
      </Section>

      <Section title="Fields" note="40px high, 2px accent focus ring, red when invalid, helper text below.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <Label>Customer name</Label>
            <Input name="a" placeholder="Acme Interiors" />
            <Description>Shown on quotations and invoices.</Description>
          </Field>
          <Field>
            <Label>Phone</Label>
            <Input name="b" invalid defaultValue="98" />
            <ErrorMessage>Enter a 10 digit number.</ErrorMessage>
          </Field>
          <Field>
            <Label>Status</Label>
            <Select name="c" defaultValue="open">
              <option value="open">Open</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </Select>
          </Field>
          <Field>
            <Label>Disabled</Label>
            <Input name="d" disabled defaultValue="Locked" />
          </Field>
          <Field className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea name="e" rows={3} placeholder="Anything the team should know" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-8">
          <CheckboxField>
            <Checkbox name="f" defaultChecked />
            <Label>Checkbox</Label>
          </CheckboxField>
          <SwitchField>
            <Switch name="g" defaultChecked />
            <Label>Switch</Label>
          </SwitchField>
          <RadioGroup name="h" defaultValue="a" className="flex gap-6">
            <RadioField>
              <Radio value="a" />
              <Label>Radio A</Label>
            </RadioField>
            <RadioField>
              <Radio value="b" />
              <Label>Radio B</Label>
            </RadioField>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Badges" note="Soft tint, full pill, optional status dot.">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((color) => (
            <Badge key={color} color={color}>
              {color}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((color) => (
            <Badge key={color} color={color} dot>
              {color}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Table" note="Row hover, hairline rows, tabular figures. Pass stickyHeader to pin the header.">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Number</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="text-right">Amount</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              ['INV-0041', 'Acme Interiors', 'green', 'Paid', '48,000.00'],
              ['INV-0042', 'Blue Door Studio', 'amber', 'Part paid', '12,500.00'],
              ['INV-0043', 'Corner Cafe', 'red', 'Overdue', '7,250.00'],
            ].map(([number, customer, color, status, amount]) => (
              <TableRow key={number} href="/design">
                <TableCell className="font-medium">{number}</TableCell>
                <TableCell>{customer}</TableCell>
                <TableCell>
                  <Badge color={color as 'green'} dot>
                    {status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Banners and toasts" note="Success banners also fire a toast. Errors stay in the banner.">
        <FormBanner tone="success">Invoice INV-0042 created</FormBanner>
        <FormBanner tone="error">Could not save. Check the highlighted fields.</FormBanner>
        <ToastDemo />
      </Section>

      <Section title="Dialog and alert" note="Blurred backdrop, scale-in, layered shadow.">
        <DialogDemo />
      </Section>

      <Section title="Loading" note="Shimmer placeholders used by the route loading state.">
        <div className="grid gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <SkeletonTable rows={3} columns={4} />
      </Section>
    </div>
  )
}

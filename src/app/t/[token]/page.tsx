import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import type {
  DispatchStatus,
  ProductionTaskStatus,
} from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Order status',
  robots: { index: false, follow: false },
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Being prepared',
  DISPATCHED: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

type StepState = 'done' | 'current' | 'upcoming'

function stepState(status: ProductionTaskStatus): StepState {
  if (status === 'DONE' || status === 'SKIPPED') {
    return 'done'
  }

  if (status === 'IN_PROGRESS' || status === 'ON_HOLD') {
    return 'current'
  }

  return 'upcoming'
}

export default async function TrackingPage({
  params,
}: PageProps<'/t/[token]'>) {
  const { token } = await params

  // Deliberately selects no prices, costs or internal notes.
  const order = await prisma.order.findUnique({
    where: { trackingToken: token },
    select: {
      number: true,
      status: true,
      subject: true,
      dueDate: true,
      customer: { select: { name: true } },
      productionTasks: {
        orderBy: { position: 'asc' },
        select: { id: true, status: true, stage: { select: { name: true } } },
      },
      dispatches: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { dispatchDate: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          dispatchDate: true,
          deliveredAt: true,
        },
      },
    },
  })

  if (!order || order.status === 'CANCELLED') {
    notFound()
  }

  const company = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { companyName: true, phone: true },
  })

  const finished = order.status === 'DISPATCHED' || order.status === 'COMPLETED'
  const steps = order.productionTasks.map((task) => ({
    id: task.id,
    name: task.stage.name,
    state: finished ? ('done' as const) : stepState(task.status),
  }))
  const doneCount = steps.filter((step) => step.state === 'done').length

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm/6 font-medium text-zinc-600">
          {company?.companyName ?? 'Order status'}
        </p>
        <h1 className="mt-1 text-xl/8 font-semibold">Order {order.number}</h1>
        <p className="text-sm/6 text-zinc-600">
          For {order.customer.name}
          {order.subject ? ` · ${order.subject}` : ''}
        </p>
      </header>

      <section
        aria-label="Summary"
        className="grid grid-cols-2 gap-4 rounded-xl bg-white p-4 ring-1 ring-zinc-950/10"
      >
        <div>
          <div className="text-xs/5 text-zinc-600">Status</div>
          <div className="text-base/7 font-semibold">
            {ORDER_STATUS_LABELS[order.status]}
          </div>
        </div>
        <div>
          <div className="text-xs/5 text-zinc-600">Expected by</div>
          <div className="text-base/7 font-semibold">
            {order.dueDate ? dateFormat.format(order.dueDate) : 'To be confirmed'}
          </div>
        </div>
      </section>

      {steps.length > 0 ? (
        <section aria-labelledby="progress" className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 id="progress" className="text-base/7 font-semibold">
              Progress
            </h2>
            <span className="text-sm/6 text-zinc-600">
              {doneCount} of {steps.length} steps done
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Production progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={doneCount}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"
          >
            <div
              className="h-full rounded-full bg-lime-600"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>

          <ol className="mt-6">
            {steps.map((step, index) => (
              <li
                key={step.id}
                aria-current={step.state === 'current' ? 'step' : undefined}
                className="relative flex gap-3 pb-6 last:pb-0"
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute top-6 left-[11px] h-full w-0.5 ${
                      step.state === 'done' ? 'bg-lime-600' : 'bg-zinc-300'
                    }`}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    step.state === 'done'
                      ? 'bg-lime-600 text-white'
                      : step.state === 'current'
                        ? 'bg-white text-lime-700 ring-2 ring-lime-600'
                        : 'bg-white text-zinc-500 ring-2 ring-zinc-300'
                  }`}
                >
                  {step.state === 'done' ? '✓' : step.state === 'current' ? '●' : ''}
                </span>
                <div>
                  <div
                    className={`text-sm/6 ${
                      step.state === 'upcoming'
                        ? 'text-zinc-600'
                        : 'font-medium text-zinc-950'
                    }`}
                  >
                    {step.name}
                  </div>
                  <div className="text-xs/5 text-zinc-600">
                    {step.state === 'done'
                      ? 'Done'
                      : step.state === 'current'
                        ? 'In progress'
                        : 'Coming up'}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {order.dispatches.length > 0 ? (
        <section aria-labelledby="delivery" className="mt-8">
          <h2 id="delivery" className="text-base/7 font-semibold">
            Delivery
          </h2>
          <ul className="mt-3 grid gap-2">
            {order.dispatches.map((dispatch) => (
              <li
                key={dispatch.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 text-sm/6 ring-1 ring-zinc-950/10"
              >
                <span>
                  {dispatch.number}
                  <span className="block text-xs/5 text-zinc-600">
                    {dispatch.deliveredAt
                      ? `Delivered ${dateFormat.format(dispatch.deliveredAt)}`
                      : dateFormat.format(dispatch.dispatchDate)}
                  </span>
                </span>
                <span className="font-medium">
                  {DISPATCH_LABELS[dispatch.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-10 text-sm/6 text-zinc-600">
        Questions about your order?
        {company?.phone ? (
          <>
            {' '}
            Call us on{' '}
            <a
              href={`tel:${company.phone}`}
              className="font-medium text-zinc-950 underline"
            >
              {company.phone}
            </a>
            .
          </>
        ) : (
          ' Please get in touch with us.'
        )}
      </footer>
    </main>
  )
}

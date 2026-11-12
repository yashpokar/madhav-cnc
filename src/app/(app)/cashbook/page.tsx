import type { Metadata } from "next";
import { TrashIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Link } from "@/components/catalyst/link";
import { Text } from "@/components/catalyst/text";
import { EmptyState, FormBanner } from "@/components/form-banner";
import { ConfirmButton } from "@/components/confirm-button";
import { PrintButton } from "@/components/print-button";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PAYMENT_MODE_LABELS } from "@/lib/labels";
import { deleteCashCredit } from "@/lib/actions/expenses";
import { requireCapability } from "@/lib/session";
import type { PaymentMode } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Cash book",
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

const longDay = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthName = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);

type Entry = {
  id: string;
  name: string;
  mode: PaymentMode;
  amount: number;
  /** Where the row leads; manual credits have no detail page. */
  href?: string;
  note: string | null;
  /** Set on manual credits, which can be deleted from here. */
  deleteId?: string;
  /** Credit notes: shown for reference only, never counted. */
  reference?: boolean;
};

function parseRange(params: Record<string, string | string[] | undefined>) {
  const pick = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const view = pick("view") === "month" ? "month" : "day";
  const dateText = pick("date");
  const today = new Date(`${iso(new Date())}T00:00:00Z`);
  const parsed =
    dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText)
      ? new Date(`${dateText}T00:00:00Z`)
      : today;
  const anchor = Number.isNaN(parsed.getTime()) ? today : parsed;

  if (view === "month") {
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();

    return {
      view,
      from: new Date(Date.UTC(y, m, 1)),
      to: new Date(Date.UTC(y, m + 1, 0)),
      prev: iso(new Date(Date.UTC(y, m - 1, 1))),
      next: iso(new Date(Date.UTC(y, m + 1, 1))),
      label: monthName.format(anchor),
      anchor,
    };
  }

  return {
    view,
    from: anchor,
    to: anchor,
    prev: iso(addDays(anchor, -1)),
    next: iso(addDays(anchor, 1)),
    label: longDay.format(anchor),
    anchor,
  };
}

function Column({
  title,
  tone,
  entries,
  total,
  canDelete,
}: {
  title: string;
  tone: "credit" | "debit";
  entries: Entry[];
  total: number;
  canDelete: boolean;
}) {
  const accent =
    tone === "credit"
      ? "text-lime-700 dark:text-lime-400"
      : "text-red-600 dark:text-red-400";

  const body = (entry: Entry) => (
    <>
      <span className="min-w-0">
        <span className="block truncate text-sm/6 font-medium">
          {entry.name}
        </span>
        <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
          {entry.reference
            ? "Credit note · not a cash movement"
            : `${PAYMENT_MODE_LABELS[entry.mode]}${entry.note ? ` · ${entry.note}` : ""}`}
        </span>
      </span>
      <span
        className={`shrink-0 text-sm/6 font-medium tabular-nums ${
          entry.reference ? "text-zinc-400 italic" : accent
        }`}
      >
        {money.format(entry.amount)}
      </span>
    </>
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-2 text-xs/5 font-semibold tracking-wide text-zinc-500 uppercase dark:border-white/10 dark:text-zinc-400">
        <span>{title}</span>
        <span className={`tabular-nums ${accent}`}>{money.format(total)}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-sm/6 text-zinc-400">—</p>
      ) : (
        <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`flex items-start gap-1 ${entry.reference ? "bg-zinc-50/60 dark:bg-white/[0.02]" : ""}`}
            >
              {entry.href ? (
                <Link
                  href={entry.href}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-white/5"
                >
                  {body(entry)}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-2">
                  {body(entry)}
                </div>
              )}
              {entry.deleteId && canDelete ? (
                <div className="py-1 pr-2 print:hidden">
                  <ConfirmButton
                    outline={false}
                    label={`Delete credit from ${entry.name}`}
                    title={`Delete this credit from ${entry.name}?`}
                    description="This removes the entry and changes the cash book balance."
                    confirmLabel="Delete"
                    action={deleteCashCredit.bind(null, entry.deleteId)}
                  >
                    <TrashIcon className="size-4" aria-hidden="true" />
                    <span className="sr-only">Delete</span>
                  </ConfirmButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function CashBookPage({
  searchParams,
}: PageProps<"/cashbook">) {
  const user = await requireCapability("expense:read");
  const params = await searchParams;
  const range = parseRange(params);
  const cashOnly = params.mode === "cash";
  const canSeeReceipts = can(user.role, "payment:read");
  const canCreate = can(user.role, "expense:create");
  const canDelete = can(user.role, "expense:delete");
  const canSeeNotes = can(user.role, "note:read");
  const saved = typeof params.saved === "string" ? params.saved : undefined;
  const savedCredit = params.savedCredit === "1";
  const modeFilter = cashOnly ? { equals: "CASH" as const } : undefined;

  const [
    expenses,
    receipts,
    priorExpenses,
    priorReceipts,
    credits,
    priorCredits,
    notes,
  ] = await Promise.all([
    prisma.expense.findMany({
      where: {
        expenseDate: { gte: range.from, lte: range.to },
        ...(modeFilter ? { paymentMode: modeFilter } : {}),
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        expenseDate: true,
        payeeName: true,
        description: true,
        paymentMode: true,
        total: true,
      },
    }),
    canSeeReceipts
      ? prisma.payment.findMany({
          where: {
            paidOn: { gte: range.from, lte: range.to },
            ...(modeFilter ? { mode: modeFilter } : {}),
          },
          orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            paidOn: true,
            mode: true,
            amount: true,
            reference: true,
            customer: { select: { name: true } },
          },
        })
      : [],
    prisma.expense.aggregate({
      where: {
        expenseDate: { lt: range.from },
        ...(modeFilter ? { paymentMode: modeFilter } : {}),
      },
      _sum: { total: true },
    }),
    canSeeReceipts
      ? prisma.payment.aggregate({
          where: {
            paidOn: { lt: range.from },
            ...(modeFilter ? { mode: modeFilter } : {}),
          },
          _sum: { amount: true },
        })
      : null,
    prisma.cashCredit.findMany({
      where: {
        entryDate: { gte: range.from, lte: range.to },
        ...(modeFilter ? { mode: modeFilter } : {}),
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        entryDate: true,
        sourceName: true,
        notes: true,
        mode: true,
        amount: true,
      },
    }),
    prisma.cashCredit.aggregate({
      where: {
        entryDate: { lt: range.from },
        ...(modeFilter ? { mode: modeFilter } : {}),
      },
      _sum: { amount: true },
    }),
    // Credit notes move no cash, so they are listed for reference only and
    // are left out when the book is limited to cash.
    canSeeNotes && !cashOnly
      ? prisma.creditDebitNote.findMany({
          where: {
            kind: "CREDIT",
            status: "ISSUED",
            noteDate: { gte: range.from, lte: range.to },
          },
          orderBy: [{ noteDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            number: true,
            noteDate: true,
            total: true,
            vendorName: true,
            customer: { select: { name: true } },
          },
        })
      : [],
  ]);

  const opening =
    (priorReceipts?._sum.amount?.toNumber() ?? 0) +
    (priorCredits._sum.amount?.toNumber() ?? 0) -
    (priorExpenses._sum.total?.toNumber() ?? 0);

  // Group by day so a month reads as a sequence of daily books.
  const days = new Map<
    string,
    { credit: Entry[]; debit: Entry[]; notes: Entry[] }
  >();
  const dayOf = (key: string) => {
    const existing = days.get(key) ?? { credit: [], debit: [], notes: [] };
    days.set(key, existing);
    return existing;
  };

  for (const p of receipts) {
    dayOf(iso(p.paidOn)).credit.push({
      id: p.id,
      name: p.customer.name,
      mode: p.mode,
      amount: p.amount.toNumber(),
      href: `/payments/${p.id}`,
      note: p.reference,
    });
  }
  for (const c of credits) {
    dayOf(iso(c.entryDate)).credit.push({
      id: `credit-${c.id}`,
      name: c.sourceName,
      mode: c.mode,
      amount: c.amount.toNumber(),
      note: c.notes,
      deleteId: c.id,
    });
  }
  for (const n of notes) {
    dayOf(iso(n.noteDate)).notes.push({
      id: `note-${n.id}`,
      name: n.customer?.name ?? n.vendorName ?? n.number,
      mode: "OTHER",
      amount: n.total.toNumber(),
      href: `/notes/${n.id}`,
      note: n.number,
      reference: true,
    });
  }
  for (const e of expenses) {
    dayOf(iso(e.expenseDate)).debit.push({
      id: e.id,
      name: e.payeeName,
      mode: e.paymentMode,
      amount: e.total.toNumber(),
      href: `/expenses/${e.id}`,
      note: e.description,
    });
  }

  const sum = (list: Entry[]) => list.reduce((t, e) => t + e.amount, 0);
  const keys = [...days.keys()].sort();
  const rows = keys.reduce<
    {
      key: string;
      credits: Entry[];
      notes: Entry[];
      debits: Entry[];
      creditTotal: number;
      debitTotal: number;
      start: number;
      end: number;
    }[]
  >((acc, key) => {
    const day = days.get(key)!;
    const start = acc.length ? acc[acc.length - 1].end : opening;
    const creditTotal = sum(day.credit);
    const debitTotal = sum(day.debit);

    return [
      ...acc,
      {
        key,
        credits: day.credit,
        notes: day.notes,
        debits: day.debit,
        creditTotal,
        debitTotal,
        start,
        end: start + creditTotal - debitTotal,
      },
    ];
  }, []);

  const totalCredit = rows.reduce((t, r) => t + r.creditTotal, 0);
  const totalDebit = rows.reduce((t, r) => t + r.debitTotal, 0);
  const closing = opening + totalCredit - totalDebit;
  const link = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams({
      view: range.view,
      date: iso(range.anchor),
      ...(cashOnly ? { mode: "cash" } : {}),
    });
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) query.delete(k);
      else query.set(k, v);
    }
    return `/cashbook?${query}`;
  };
  const pill = (active: boolean) =>
    active
      ? "rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white"
      : "rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white";

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Cash book</Heading>
          <Text>
            Money in on the left, money out on the right, with the balance
            carried from day to day.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton label="Print" />
          <Button outline href="/expenses">
            All expenses
          </Button>
          {canCreate ? (
            <Button outline href="/cashbook/credit/new">
              Add credit
            </Button>
          ) : null}
          {canCreate ? (
            <Button href="/expenses/lite/new">Quick expense</Button>
          ) : null}
        </div>
      </div>

      {saved ? (
        <FormBanner tone="success">Expense {saved} saved</FormBanner>
      ) : null}
      {savedCredit ? (
        <FormBanner tone="success">Credit saved</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          <Link
            href={link({ view: "day" })}
            className={pill(range.view === "day")}
          >
            Day
          </Link>
          <Link
            href={link({ view: "month" })}
            className={pill(range.view === "month")}
          >
            Month
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button
            outline
            href={link({ date: range.prev })}
            aria-label="Previous"
          >
            ←
          </Button>
          <span className="min-w-40 text-center text-sm/6 font-medium">
            {range.label}
          </span>
          <Button outline href={link({ date: range.next })} aria-label="Next">
            →
          </Button>
          <Button plain href={link({ date: iso(new Date()) })}>
            Today
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          <Link href={link({ mode: null })} className={pill(!cashOnly)}>
            All payments
          </Link>
          <Link href={link({ mode: "cash" })} className={pill(cashOnly)}>
            Cash only
          </Link>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-semibold">
          Cash book · {range.label}
          {cashOnly ? " · cash only" : ""}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Opening balance", value: opening },
          { label: "Credit − Debit", value: totalCredit - totalDebit },
          { label: "Closing balance", value: closing },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
          >
            <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
              {tile.label}
            </div>
            <div
              className={`mt-1 text-xl/8 font-semibold tabular-nums ${
                tile.value < 0 ? "text-red-600 dark:text-red-400" : ""
              }`}
            >
              {money.format(tile.value)}
            </div>
          </div>
        ))}
      </div>

      {!canSeeReceipts ? (
        <FormBanner tone="error">
          Receipts are not visible to your role, so CREDIT and the balances only
          reflect expenses.
        </FormBanner>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded"
          description={`No receipts or expenses${cashOnly ? " paid in cash" : ""} for this ${range.view}.`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {rows.map((day) => (
            <section
              key={day.key}
              className="overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2 text-sm/6 dark:bg-white/5">
                <span className="font-semibold">
                  {longDay.format(new Date(`${day.key}T00:00:00Z`))}
                </span>
                <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                  Opening {money.format(day.start)}
                </span>
              </header>
              <div className="grid grid-cols-1 divide-zinc-950/10 md:grid-cols-2 md:divide-x dark:divide-white/10">
                <Column
                  title="Credit"
                  tone="credit"
                  entries={[...day.credits, ...day.notes]}
                  total={day.creditTotal}
                  canDelete={canDelete}
                />
                <Column
                  title="Debit"
                  tone="debit"
                  entries={day.debits}
                  total={day.debitTotal}
                  canDelete={false}
                />
              </div>
              <footer className="flex justify-end border-t border-zinc-950/10 px-4 py-2 text-sm/6 dark:border-white/10">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Closing&nbsp;
                </span>
                <span className="font-semibold tabular-nums">
                  {money.format(day.end)}
                </span>
              </footer>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

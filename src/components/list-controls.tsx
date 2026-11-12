import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { LIST_SORTS, readListControls } from "@/lib/list-controls";

type Params = Record<string, string | string[] | undefined>;

/** Sort and amount-range controls. Other filters (tab, search) are kept. */
export function ListControls({
  params,
  pathname,
  amountLabel = "Amount",
  withDue = false,
}: {
  params: Params;
  pathname: string;
  amountLabel?: string;
  /** Offer sorting by the amount still owed (invoices). */
  withDue?: boolean;
}) {
  const { sort, min, max } = readListControls(params);
  const active = sort !== undefined || min !== undefined || max !== undefined;
  const keep = Object.entries(params).filter(
    ([key, value]) =>
      !["sort", "min", "max", "page"].includes(key) &&
      typeof value === "string",
  ) as [string, string][];
  const clear = new URLSearchParams(
    keep.filter(([key]) => key !== "size"),
  ).toString();

  return (
    <form
      method="get"
      action={pathname}
      className="flex flex-wrap items-end gap-3 print:hidden"
    >
      {keep.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
        Sort by
        <Select name="sort" defaultValue={sort ?? ""} className="min-w-44">
          <option value="">Default order</option>
          {Object.entries(LIST_SORTS)
            .filter(([value]) => withDue || !value.startsWith("due_"))
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </Select>
      </label>
      <div className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
        {amountLabel} range (₹)
        <div className="flex items-center gap-2">
          <Input
            name="min"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Min"
            aria-label={`Minimum ${amountLabel.toLowerCase()}`}
            defaultValue={min ?? ""}
            className="w-28"
          />
          <span aria-hidden="true">–</span>
          <Input
            name="max"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Max"
            aria-label={`Maximum ${amountLabel.toLowerCase()}`}
            defaultValue={max ?? ""}
            className="w-28"
          />
        </div>
      </div>
      <Button type="submit" outline>
        Apply
      </Button>
      {active ? (
        <Button plain href={clear ? `${pathname}?${clear}` : pathname}>
          Clear
        </Button>
      ) : null}
    </form>
  );
}

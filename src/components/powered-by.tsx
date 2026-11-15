import { BrandMark } from '@/components/brand-mark'

/** Quiet attribution for public share pages. Screen only; never printed. */
export function PoweredBy() {
  return (
    <p className="mt-12 flex items-center justify-center gap-1.5 text-xs/5 text-zinc-500 print:hidden">
      <span>Powered by</span>
      <a
        href="https://prodlys.com"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 rounded font-medium text-zinc-600 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
      >
        <BrandMark className="size-3.5" />
        Prodlys
      </a>
    </p>
  )
}

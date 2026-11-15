export default function SharedInvoiceLayout({
  children,
}: LayoutProps<'/i/[token]'>) {
  return <div className="min-h-dvh bg-white text-zinc-950">{children}</div>
}

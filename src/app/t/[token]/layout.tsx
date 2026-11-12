export default function TrackingLayout({
  children,
}: LayoutProps<'/t/[token]'>) {
  return <div className="min-h-dvh bg-zinc-50 text-zinc-950">{children}</div>
}

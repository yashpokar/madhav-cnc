export default function SharedLayout({
  children,
}: LayoutProps<'/q/[token]'>) {
  return <div className="min-h-dvh bg-white text-zinc-950">{children}</div>
}

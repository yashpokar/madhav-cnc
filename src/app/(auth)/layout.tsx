import { AuthLayout } from '@/components/catalyst/auth-layout'

export default function AuthPagesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthLayout>{children}</AuthLayout>
}

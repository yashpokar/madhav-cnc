import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { THEME_SCRIPT } from '@/lib/theme'
import { AppToaster } from '@/components/toaster'
import { BRAND } from '@/lib/brand'

// A neutral, highly legible UI face with tabular figures for money columns.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || BRAND.appUrl),
  title: {
    default: `${BRAND.name}: ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  keywords: ['business management', 'quotations', 'invoicing', 'production'],
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'default' },
  // The app sits behind sign-in; only the sign-in and register pages opt in.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name}: ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name}: ${BRAND.tagline}`,
    description: BRAND.description,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f17' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} font-sans antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-paper text-zinc-950 dark:bg-zinc-950 dark:text-white">
        {children}
        <AppToaster />
      </body>
    </html>
  )
}

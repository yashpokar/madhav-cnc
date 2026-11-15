import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { THEME_SCRIPT } from '@/lib/theme'
import { AppToaster } from '@/components/toaster'

// A neutral, highly legible UI face with tabular figures for money columns.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Prodlys',
    template: '%s · Prodlys',
  },
  description: 'Run your whole business in one place: quotes, orders, production and billing.',
  applicationName: 'Prodlys',
  appleWebApp: { capable: true, title: 'Prodlys', statusBarStyle: 'default' },
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

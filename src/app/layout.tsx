import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { THEME_SCRIPT } from '@/lib/theme'

// Engineered, workshop-like letterforms with tabular figures for money columns.
const plex = IBM_Plex_Sans({
  variable: '--font-plex',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Madhav CNC',
    template: '%s · Madhav CNC',
  },
  description: 'Order management for Madhav CNC',
  applicationName: 'Madhav CNC',
  appleWebApp: { capable: true, title: 'Madhav CNC', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0d121b' },
    { media: '(prefers-color-scheme: dark)', color: '#0d121b' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${plex.variable} font-sans antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-white text-zinc-950 lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950">
        {children}
      </body>
    </html>
  )
}

'use client'

import { Toaster } from 'sonner'

/**
 * The app's toast host, mounted once in the root layout. Colours come from the
 * --toast-* variables in globals.css so light and dark follow the theme switch
 * without sonner needing to know about it.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      offset={16}
      mobileOffset={{ bottom: 72, left: 16, right: 16 }}
      closeButton
      className="print:hidden"
      style={
        {
          '--normal-bg': 'var(--toast-bg)',
          '--normal-text': 'var(--toast-fg)',
          '--normal-border': 'var(--toast-border)',
          '--border-radius': '0.875rem',
          fontFamily: 'var(--font-inter), system-ui, sans-serif',
        } as React.CSSProperties
      }
    />
  )
}

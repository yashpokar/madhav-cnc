const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

/** "15 Nov 2026" in Indian time. */
export function formatBillingDate(date: Date): string {
  return dateFormat.format(date)
}

import { redirect } from 'next/navigation'

// The Cash book became the Day book; keep old links and bookmarks working.
export default function CashBookRedirect() {
  redirect('/daybook')
}

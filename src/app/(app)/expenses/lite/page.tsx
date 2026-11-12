import { redirect } from 'next/navigation'

// The light view grew into the Day book; keep old links and bookmarks working.
export default function LiteExpensesRedirect() {
  redirect('/daybook')
}

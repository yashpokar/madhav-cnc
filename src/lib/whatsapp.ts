/**
 * Click-to-chat link (no WhatsApp Business API needed). Opens WhatsApp with the
 * message pre-filled; the sender still presses send.
 * Bare 10-digit numbers are treated as Indian numbers.
 */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  const number = digits.length === 10 ? `91${digits}` : digits
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/'

  return `${base}?text=${encodeURIComponent(text)}`
}

// Admin emails can be a single email or comma-separated list
// Set VITE_ADMIN_EMAILS in your .env file (e.g., "admin1@example.com,admin2@example.com")
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.VITE_ADMIN_EMAIL || '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Normalizes a date string to YYYY-MM-DD.
 * Accepts "YYYY-MM-DD" or "YYYYMMDD" (mssql converts sql.Date values via
 * `new Date(value)`, and "YYYYMMDD" parses as Invalid Date without dashes).
 * Returns null if the input is empty/null or not 8 digits once dashes are stripped.
 */
export function normalizeSqlDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

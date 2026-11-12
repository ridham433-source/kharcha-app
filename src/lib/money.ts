// All money is stored as integer paise so totals never drift.

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234567 -> "₹12,345.67", 10000000 -> "₹1,00,000" */
export function fmt(paise: number): string {
  const neg = paise < 0;
  const a = Math.abs(Math.round(paise));
  const s = a % 100 === 0 ? nf0.format(a / 100) : nf2.format(a / 100);
  return `${neg ? '-' : ''}₹${s}`;
}

/** Parses "1,234.5" -> 123450. Returns null when the text is not a valid amount. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[₹,\s]/g, '');
  if (t === '' || t === '.' || !/^\d*\.?\d{0,2}$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

/** paise -> text for an input box ("250" or "250.50") */
export function toInput(paise: number): string {
  const v = paise / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

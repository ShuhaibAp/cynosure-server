/** Largest line or grand total we accept (₹1 trillion); keeps every amount exactly representable. */
export const MAX_TOTAL = 1_000_000_000_000;

/**
 * Quantity × unit price, rounded half-up to whole paise. Quantities carry up to 3 decimals and
 * prices up to 2, so the product is computed in exact integers (BigInt), never floating point.
 */
export function lineTotal(quantity: number, unitPrice: number): number {
  const thousandths = BigInt(Math.round(quantity * 1000));
  const paise = BigInt(Math.round(unitPrice * 100));
  return Number((thousandths * paise + 500n) / 1000n) / 100;
}

/** GST on the subtotal, half-up to whole paise; the rate carries up to 2 decimals (e.g. 18 or 12.5). */
export function gstAmount(subtotal: number, gstPercent: number): number {
  const paise = BigInt(Math.round(subtotal * 100));
  const rate = BigInt(Math.round(gstPercent * 100));
  return Number((paise * rate + 5000n) / 10000n) / 100;
}

/** Sums amounts in whole paise so repeated addition can't drift. */
export function sumTotals(totals: Array<number | null>): number {
  const paise = totals.reduce<number>(
    (sum, t) => sum + (t === null ? 0 : Math.round(t * 100)),
    0,
  );
  return paise / 100;
}

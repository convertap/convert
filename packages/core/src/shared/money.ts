/**
 * Money is integer pesewas, GHS only (invariant I8).
 *
 * Floating point is not a rounding inconvenience here; it is a deal value that stops
 * reconciling with an invoice. A currency field exists but takes one value for now.
 */
export type Pesewas = number & { readonly __brand: 'Pesewas' };

export const CURRENCY = 'GHS' as const;

export const pesewas = (value: number): Pesewas => {
  if (!Number.isInteger(value)) {
    throw new Error(`money must be whole pesewas, received ${value}`);
  }
  if (value < 0) {
    throw new Error('money cannot be negative');
  }
  return value as Pesewas;
};

export const fromCedis = (cedis: number): Pesewas => {
  const scaled = Math.round(cedis * 100);
  if (Math.abs(cedis * 100 - scaled) > 1e-6) {
    throw new Error(`amount ${cedis} has sub-pesewa precision`);
  }
  return pesewas(scaled);
};

export const toCedis = (amount: Pesewas): number => amount / 100;

export const addMoney = (a: Pesewas, b: Pesewas): Pesewas => pesewas(a + b);

export const sumMoney = (amounts: readonly Pesewas[]): Pesewas =>
  amounts.reduce<Pesewas>((total, next) => addMoney(total, next), pesewas(0));

/** Display helper. Formatting lives here so every surface shows the same thing. */
export const formatGhs = (amount: Pesewas): string =>
  `GHS ${toCedis(amount).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

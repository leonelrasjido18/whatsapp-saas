/**
 * Formats a number as ARS currency
 * e.g., 1500.50 -> "$ 1.500,50"
 */
export function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Helper to ensure a value is a valid 2-decimal money amount
 */
export function roundToTwoDecimals(amount: number): number {
  return Math.round(amount * 100) / 100;
}

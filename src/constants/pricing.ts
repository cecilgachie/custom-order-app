/**
 * Pricing rules for the app screens (Home cards, quick add, customizer).
 *
 * THE DATABASE IS THE AUTHORITY: it recalculates every price itself, so a
 * customer can never pay a different amount than the one stored. If you change
 * a number here you MUST change it in these two other places too:
 *   1. the database function cake_orders_enforce_rules (see migration 20261120)
 *   2. the Nova assistant's instructions (supabase/functions/nova-assistant)
 */
export type CakeSize = "Small" | "Medium" | "Large";

export const PRICE_PER_KG = 1000; // KES
export const MIN_WEIGHT_KG = 0.5;
export const MAX_WEIGHT_KG = 20;
export const WEIGHT_STEP = 0.5;
export const DEFAULT_ORDER_WEIGHT_KG = MIN_WEIGHT_KG; // what the quick "+" button orders
export const SIZE_MULTIPLIERS: Record<CakeSize, number> = { Small: 0.8, Medium: 1.0, Large: 1.4 };

export const priceFor = (weightKg: number, size: CakeSize = "Medium") =>
  Math.round(weightKg * PRICE_PER_KG * SIZE_MULTIPLIERS[size]);
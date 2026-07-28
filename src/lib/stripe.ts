import Stripe from "stripe"

let _stripe: Stripe | null = null

export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured")
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

// Replace with your Stripe price IDs from the Dashboard:
// Create Products > "Monthly" and "Yearly" (one Product per plan tier),
// then attach a Price to each. Copy the price_xxx IDs here.
export const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID || "price_monthly"
export const YEARLY_PRICE_ID = process.env.STRIPE_YEARLY_PRICE_ID || "price_yearly"

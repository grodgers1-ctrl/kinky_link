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

export const MONTHLY_PRICE_ID = "price_monthly"
export const YEARLY_PRICE_ID = "price_yearly"

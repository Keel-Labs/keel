const DEFAULT_PRO_CHECKOUT_URL =
  'https://keel-labs.lemonsqueezy.com/checkout/buy/a1fb0eee-c48d-4125-a5ed-edfb57462f37';

export const PRO_CHECKOUT_URL =
  import.meta.env.VITE_KEEL_PRO_CHECKOUT_URL || DEFAULT_PRO_CHECKOUT_URL;

export function openProCheckout() {
  window.open(PRO_CHECKOUT_URL, '_blank');
}

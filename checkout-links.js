// Shared tier + currency -> checkout URL resolution.
// Extracted from account.html so other pages (e.g. dashboard.html) can offer
// one-click upgrades without duplicating the Razorpay/Lemon Squeezy link logic.

const RAZORPAY_CHECKOUT_IDS = { starter: 'vVWB1lQ', pro: 'bEQTH8N' };
const LEMON_CHECKOUT_LINKS = {
  starter: 'https://aadya-proposals.lemonsqueezy.com/checkout/buy/e5077d64-76bb-474e-8313-cf7d3693affc',
  pro: 'https://aadya-proposals.lemonsqueezy.com/checkout/buy/36b1b71e-e345-4e59-a988-267c99ec1dd2'
};

function detectIsIndia() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta';
}

function getCheckoutUrl(tier, currency, email) {
  if (currency === 'inr') {
    const razorpayId = RAZORPAY_CHECKOUT_IDS[tier];
    return `https://rzp.io/rzp/${razorpayId}?customer_email=${encodeURIComponent(email)}`;
  }
  return LEMON_CHECKOUT_LINKS[tier];
}

const SUBSCRIPTION_CHECKOUT_WEBHOOK = 'https://hook.eu1.make.com/7bozgktjwj1u7b03r4qhlgg10zd9e26p';

async function getSubscriptionCheckoutUrl(tier, email) {
  const response = await fetch(SUBSCRIPTION_CHECKOUT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, email })
  });
  if (!response.ok) throw new Error('Failed to create subscription checkout');
  const data = await response.json();
  return data.checkout_url;
}

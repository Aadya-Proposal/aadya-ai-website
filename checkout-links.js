// Shared tier + currency -> checkout URL resolution.
// Extracted from account.html so other pages (e.g. dashboard.html) can offer
// one-click upgrades without duplicating the Razorpay/Lemon Squeezy link logic.

const RAZORPAY_CHECKOUT_IDS = { starter: 'vVWB1lQ', pro: 'bEQTH8N' };
const RAZORPAY_PLAN_PRICES_INR = { starter: 299, pro: 599 };
const LEMON_CHECKOUT_LINKS = {
  starter: 'https://aadya-proposals.lemonsqueezy.com/checkout/buy/e5077d64-76bb-474e-8313-cf7d3693affc',
  pro: 'https://aadya-proposals.lemonsqueezy.com/checkout/buy/36b1b71e-e345-4e59-a988-267c99ec1dd2'
};
const LEMON_PLAN_PRICES = { starter: 5, pro: 10 };

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
const RAZORPAY_KEY_ID = 'rzp_live_TOYtX79aLJs8QF';

// Calls the Make.com webhook, which creates a fresh Razorpay Subscription
// server-side and returns { checkout_url, subscription_id } for it.
async function createSubscriptionCheckout(tier, email) {
  const response = await fetch(SUBSCRIPTION_CHECKOUT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, email })
  });
  if (!response.ok) throw new Error('Failed to create subscription checkout');
  return response.json();
}

// Back-compat wrapper for callers that only want the hosted checkout_url
// (e.g. dashboard.html's in-app upgrade-wall modals, opened in a new tab).
async function getSubscriptionCheckoutUrl(tier, email) {
  const data = await createSubscriptionCheckout(tier, email);
  return data.checkout_url;
}

// Opens Razorpay Checkout.js in-page for a subscription created via
// createSubscriptionCheckout(), so payment success stays on aadya-ai.com
// (redirected to /welcome.html) instead of stranding the user on Razorpay's
// own hosted confirmation page with no way back into the dashboard.
function openSubscriptionCheckout({ subscriptionId, tier, email }) {
  // GA4: checkout is starting. This path is Razorpay-only (INR) — non-Indian
  // buyers never reach this function, see the LemonSqueezy click handlers
  // in index.html/account.html instead.
  if (typeof gtag === 'function') {
    gtag('event', 'begin_checkout', {
      value: RAZORPAY_PLAN_PRICES_INR[tier],
      currency: 'INR',
      tier: tier
    });
  }

  const rzp = new Razorpay({
    key: RAZORPAY_KEY_ID,
    subscription_id: subscriptionId,
    name: 'Aadya AI',
    description: `${tier === 'pro' ? 'Pro' : 'Starter'} Plan`,
    prefill: { email: email },
    theme: { color: '#0F2D6B' },
    handler: function (response) {
      if (typeof gtag === 'function') {
        gtag('event', 'purchase', {
          transaction_id: response.razorpay_subscription_id || subscriptionId,
          value: RAZORPAY_PLAN_PRICES_INR[tier],
          currency: 'INR',
          tier: tier
        });
      }
      window.location.href = `/welcome.html?plan=${encodeURIComponent(tier)}&email=${encodeURIComponent(email)}`;
    }
  });
  rzp.open();
}

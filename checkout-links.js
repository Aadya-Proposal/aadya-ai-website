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

// Always let the buyer choose; timezone is not a reliable billing-country signal.
function showRegionalUpgrade(tier, email) {
  if (!['starter', 'pro'].includes(tier)) throw new Error('Unknown plan');
  document.getElementById('regionalCheckout')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'regionalCheckout';
  dialog.style.cssText = 'margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px;max-width:440px;width:calc(100% - 32px);font-family:Arial,sans-serif;color:#0F2D6B;';
  dialog.innerHTML = `<h2 style="margin:0 0 12px">Upgrade to ${tier === 'pro' ? 'Pro' : 'Starter'}</h2>
    <p>Choose your billing region. Invoice-linked receipts stay free.</p>
    <button type="button" data-region="inr" style="display:block;width:100%;padding:14px;margin:12px 0;cursor:pointer">India · ₹${RAZORPAY_PLAN_PRICES_INR[tier]}/month · Razorpay</button>
    <button type="button" data-region="usd" style="display:block;width:100%;padding:14px;margin:12px 0;cursor:pointer">EU / US · US$${LEMON_PLAN_PRICES[tier]}/month · Lemon Squeezy</button>
    <p style="font-size:12px">International plans are priced in USD. Review the final total at checkout.</p>
    <p role="alert" data-error style="color:#b91c1c"></p>
    <button type="button" data-close>Not now</button>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelectorAll('[data-region]').forEach(button => {
    button.onclick = async () => {
      if (button.dataset.region === 'usd') {
        const url = new URL(LEMON_CHECKOUT_LINKS[tier]);
        if (email) url.searchParams.set('checkout[email]', email);
        if (typeof gtag === 'function') gtag('event', 'begin_checkout', { value: LEMON_PLAN_PRICES[tier], currency: 'USD', tier });
        window.location.assign(url.href);
        return;
      }
      dialog.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        const { subscription_id } = await createSubscriptionCheckout(tier, email);
        if (!subscription_id) throw new Error('Missing subscription');
        openSubscriptionCheckout({ subscriptionId: subscription_id, tier, email });
        dialog.close();
      } catch (e) {
        dialog.querySelector('[data-error]').textContent = 'Could not open checkout. Please try again.';
        dialog.querySelectorAll('button').forEach(b => b.disabled = false);
      }
    };
  });
  dialog.addEventListener('cancel', event => { if (dialog.querySelector('[data-close]').disabled) event.preventDefault(); });
  dialog.showModal();
}

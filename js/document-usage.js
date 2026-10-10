// Shared allowance. The backend owns billing-period resets and atomic increments.
const DOCUMENT_LIMITS = Object.freeze({ free: 3, starter: 20, pro: Infinity });
function getPlanLimit(plan) {
  const name = String(plan || 'free').toLowerCase();
  return name.includes('pro') ? DOCUMENT_LIMITS.pro : name.includes('starter') ? DOCUMENT_LIMITS.starter : DOCUMENT_LIMITS.free;
}
async function readDocumentUsage(client, email) {
  const { data, error } = await client.from('users').select('plan, name, documents_used').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Your account is not ready. Please reload your dashboard.');
  const used = Number(data.documents_used ?? 0);
  if (!Number.isFinite(used) || used < 0) throw new Error('Could not read your document allowance.');
  const plan = String(data.plan || 'free').toLowerCase();
  return { plan, used, limit: getPlanLimit(plan), name: data.name || '' };
}

// Monthly allowance (calendar month, UTC). The database owns the count:
// upsert_user_doc_count() recomputes users.documents_used from invoices, proposals
// and standalone receipts created since the 1st. The browser only reads it.
// Invoice-linked receipts (invoice_id set) are never counted or blocked.
const DOCUMENT_LIMITS = Object.freeze({ free: 3, starter: 20, pro: Infinity });
function getPlanLimit(plan) {
  const name = String(plan || 'free').toLowerCase();
  return name.includes('pro') ? DOCUMENT_LIMITS.pro : name.includes('starter') ? DOCUMENT_LIMITS.starter : DOCUMENT_LIMITS.free;
}
function formatDocumentUsage(used, limit) {
  const noun = used === 1 ? 'document' : 'documents';
  return limit === Infinity
    ? `${used} ${noun} this month — unlimited on Pro`
    : `${used} of ${limit} documents used this month`;
}
async function readDocumentUsage(client, email) {
  const { data, error } = await client.from('users').select('plan, name, documents_used').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Your account is not ready. Please reload your dashboard.');
  const used = Number(data.documents_used ?? 0);
  if (!Number.isFinite(used) || used < 0) throw new Error('Could not read your monthly document allowance.');
  const plan = String(data.plan || 'free').toLowerCase();
  return { plan, used, limit: getPlanLimit(plan), name: data.name || '' };
}

// Admin-only one-off migration. Dry-run by default. Requires @supabase/supabase-js.
// Copies and verifies bytes before updating pdf_path. NEVER deletes original objects.
const { createClient } = require('@supabase/supabase-js');
const { createHash } = require('node:crypto');
const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = client.storage.from('proposals');
const digest = async blob => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
function legacyPath(value) {
  try {
    const parsed = new URL(value);
    const prefix = '/storage/v1/object/proposals/';
    if (parsed.origin !== new URL(url).origin || !parsed.pathname.startsWith(prefix)) return null;
    const name = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return /^[A-Za-z0-9_-]+\.pdf$/.test(name) ? name : null;
  } catch (_) { return null; }
}
(async () => {
  const users = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) {
      const email = u.email.toLowerCase();
      users.set(email, users.has(email) ? null : u.id);
    }
    if (data.users.length < 1000) break;
  }
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('proposals').select('id,user_email,pdf_url,pdf_path').order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  // A legacy URL attached to multiple accounts is ambiguous: never copy it into either folder.
  const owners = new Map();
  for (const row of rows) {
    const old = legacyPath(row.pdf_url);
    if (old) {
      if (!owners.has(old)) owners.set(old, new Set());
      owners.get(old).add(String(row.user_email).toLowerCase());
    }
  }
  let completed = 0, blocked = 0;
  for (const row of rows) {
    if (row.pdf_path) continue;
    const source = legacyPath(row.pdf_url);
    const uid = users.get(String(row.user_email).toLowerCase());
    if (!source || !uid || owners.get(source).size !== 1) {
      console.log(row.id, 'BLOCKED: unresolved owner, unsupported URL, or shared source'); blocked++; continue;
    }
    const target = `${uid}/${source}`;
    const { data: original, error: sourceError } = await bucket.download(source);
    if (sourceError) { console.log(row.id, 'BLOCKED: source unavailable'); blocked++; continue; }
    if (!apply) { console.log(row.id, 'READY', source, '->', target); continue; }
    try {
      const copied = await bucket.copy(source, target);
      // Existing destination is acceptable only if the bytes are identical.
      const { data: destination, error: readError } = await bucket.download(target);
      if (readError) throw copied.error || readError;
      if (await digest(original) !== await digest(destination)) throw new Error('Destination content mismatch');
      const { data: updated, error } = await client.from('proposals').update({ pdf_path: target })
        .eq('id', row.id).eq('user_email', row.user_email).eq('pdf_url', row.pdf_url).is('pdf_path', null).select('id');
      if (error || updated.length !== 1) throw error || new Error('Row changed during migration; inspect before retry');
      completed++; console.log(row.id, 'VERIFIED AND MAPPED');
    } catch (_) { blocked++; console.log(row.id, 'BLOCKED: copy, verification or row update failed; inspect and rerun'); }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', completed, blocked, originalFilesDeleted: 0 }));
  if (blocked) process.exitCode = 1;
})().catch(() => { console.error('Migration stopped. Check configuration and permissions. No original files were deleted.'); process.exitCode = 1; });

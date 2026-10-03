// Business profile stored on public.users (business_name, business_email,
// tax_id, business_address, logo_url). Shared by every page that reads or
// writes it: account, receipt, invoices, and the Fillout invoice-form openers.

const BUSINESS_PROFILE_FIELDS = ['business_name', 'business_email', 'tax_id', 'business_address', 'logo_url'];
const BUSINESS_LOGO_BUCKET = 'logos';
const BUSINESS_LOGO_MAX_BYTES = 5 * 1024 * 1024;

// Normalises a users row (or form values) to just the profile fields, with
// blanks collapsed to null so comparisons and saves are consistent.
function pickBusinessProfile(row) {
  const profile = {};
  BUSINESS_PROFILE_FIELDS.forEach(function(f) {
    const v = row && row[f] != null ? String(row[f]).trim() : '';
    profile[f] = v || null;
  });
  return profile;
}

// Kept as its own query (not merged into callers' plan/name selects) so a
// failure here — e.g. columns not migrated yet — never breaks plan checks.
// Resolves to an all-null profile on any error.
async function loadBusinessProfile(client, email) {
  try {
    const { data, error } = await client
      .from('users').select(BUSINESS_PROFILE_FIELDS.join(', ')).eq('email', email).maybeSingle();
    if (error) throw error;
    return pickBusinessProfile(data);
  } catch (e) {
    console.error('Business profile load error:', e);
    return pickBusinessProfile(null);
  }
}

// Sends only email + profile columns: authenticated has column-level
// INSERT/UPDATE grants on users, so billing columns must never be included.
async function saveBusinessProfile(client, email, profile) {
  const { error } = await client
    .from('users')
    .upsert(Object.assign({ email: email }, pickBusinessProfile(profile)), { onConflict: 'email' });
  if (error) throw error;
}

function businessProfileChanged(a, b) {
  const pa = pickBusinessProfile(a);
  const pb = pickBusinessProfile(b);
  return BUSINESS_PROFILE_FIELDS.some(function(f) { return pa[f] !== pb[f]; });
}

// Uploads to the public logos bucket and resolves to the file's public URL.
async function uploadBusinessLogo(client, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from(BUSINESS_LOGO_BUCKET).upload(path, file);
  if (error) throw error;
  return client.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Fillout pre-fill: each non-empty field becomes a URL parameter named after
// its column, alongside the existing user_email / user_name parameters.
function appendBusinessProfileParams(params, profile) {
  const p = pickBusinessProfile(profile);
  BUSINESS_PROFILE_FIELDS.forEach(function(f) { if (p[f]) params.append(f, p[f]); });
}

// Only user-folder paths are signed. Flat legacy files need the migration in docs/batch-one-rollout.md.
// Keep false until the SQL, file migration and Make upload steps in that doc are done.
// While false the dashboard renders no proposal download controls and never calls Storage for proposals.
const PROPOSAL_DOWNLOADS_ENABLED = true;
function proposalObjectPath(proposal, userId) {
  const path = proposal.pdf_path;
  if (typeof path !== 'string' || !userId) return null;
  const parts = path.split('/');
  if (parts.length !== 2 || parts[0] !== userId || !parts[1].endsWith('.pdf') || /[\\%?#\x00-\x1f]/.test(path) || parts.some(p => p === '.' || p === '..')) return null;
  return path;
}
async function downloadProposal(client, proposal, button) {
  if (!PROPOSAL_DOWNLOADS_ENABLED || button.disabled) return;
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Preparing…';
  try {
    const { data: { session }, error: authError } = await client.auth.getSession();
    if (authError || !session?.user) throw new Error('Sign in again to download this document.');
    const path = proposalObjectPath(proposal, session.user.id);
    if (!path) throw new Error('This older document is not ready for download yet. Please contact support.');
    const { data, error } = await client.storage.from('proposals').createSignedUrl(path, 60, { download: true });
    if (error || !data?.signedUrl) throw new Error('Could not download this document. Please try again or contact support.');
    window.location.assign(data.signedUrl);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
function renderProposalHistory(client, proposals) {
  const container = document.getElementById('historyContainer');
  container.replaceChildren();
  if (!proposals?.length) { container.textContent = 'No proposals or SOWs yet.'; return; }
  proposals.forEach(proposal => {
    const row = document.createElement('div'); row.className = 'history-item';
    const icon = document.createElement('div'); icon.className = 'file-icon'; icon.textContent = '📄';
    const info = document.createElement('div'); info.className = 'history-info';
    const name = document.createElement('div'); name.className = 'history-name'; name.textContent = `${proposal.client_name || 'Client'} — ${proposal.proposal_title || 'Document'}`;
    const date = document.createElement('div'); date.className = 'history-date'; date.textContent = new Date(proposal.created_at).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'});
    info.append(name, date); row.append(icon, info);
    if (!PROPOSAL_DOWNLOADS_ENABLED) {
      // No download controls until the storage migration is live.
    } else if (proposal.pdf_path) {
      const button = document.createElement('button'); button.className = 'history-download'; button.textContent = 'Download';
      button.onclick = () => downloadProposal(client, proposal, button); row.append(button);
    } else if (proposal.pdf_url) {
      const notice = document.createElement('span'); notice.className = 'history-date'; notice.textContent = 'Download not available'; row.append(notice);
    }
    container.append(row);
  });
}

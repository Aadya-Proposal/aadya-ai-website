function openInvoicePopup(email, name, onClose) {
  onClose = onClose || function(){};

  const existing = document.getElementById('invoicePopupOverlay');
  if (existing) existing.remove();

  const params = new URLSearchParams();
  if (email) params.append('user_email', email);
  if (name) params.append('user_name', name);

  const formUrl = 'https://forms.fillout.com/t/5wEMqv7uzCus' + (params.toString() ? '?' + params.toString() : '');

  const overlay = document.createElement('div');
  overlay.id = 'invoicePopupOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,45,107,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

  console.log('Invoice popup URL:', formUrl);
  console.log('Invoice email value:', email);
  console.log('Invoice name value:', name);
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;width:100%;max-width:860px;height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
      <div style="background:#0F2D6B;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
          <span style="color:white;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;">Generate Invoice</span>
        </div>
        <button id="invoicePopupCloseBtn" style="background:rgba(255,255,255,0.15);border:none;color:white;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">✕</button>
      </div>
      <iframe src="${formUrl}" style="flex:1;border:none;width:100%;" allow="camera;microphone;autoplay" title="Generate Invoice"></iframe>
    </div>
  `;

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) { overlay.remove(); onClose(); }
  });
  overlay.querySelector('#invoicePopupCloseBtn').addEventListener('click', function() {
    overlay.remove();
    onClose();
  });

  document.body.appendChild(overlay);

  // Listen for Fillout postMessage when form is submitted
  function _invDashMsgHandler(event) {
    if (!event.origin.includes('fillout.com')) return;
    const d = event.data;
    const submitted = d && (
      d.type === 'fillout:formCompleted' ||
      d.type === 'formCompleted' ||
      d.event === 'form_submitted' ||
      d === 'submitted'
    );
    if (!submitted) return;
    window.removeEventListener('message', _invDashMsgHandler);
    const ol = document.getElementById('invoicePopupOverlay');
    if (!ol) return;
    const iframe = ol.querySelector('iframe');
    if (iframe) iframe.style.display = 'none';
    const wrap = iframe ? iframe.parentElement : ol.querySelector('div');
    const ty = document.createElement('div');
    ty.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:40px;';
    ty.innerHTML =
      '<div style="font-size:56px;margin-bottom:20px;">✅</div>' +
      '<h2 style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:800;color:#0F2D6B;margin-bottom:12px;">Your invoice is on its way!</h2>' +
      '<p style="font-size:16px;color:#64748b;margin-bottom:28px;line-height:1.6;">Check your inbox in 2 minutes.</p>' +
      '<a href="/invoices" style="display:inline-flex;align-items:center;gap:8px;background:#0F2D6B;color:white;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;">View My Invoices →</a>' +
      '<p style="font-size:12px;color:#94a3b8;margin-top:20px;">This window closes automatically in 5 seconds</p>';
    wrap.appendChild(ty);
    setTimeout(function() {
      const o = document.getElementById('invoicePopupOverlay');
      if (o) o.remove();
      onClose();
    }, 5000);
  }
  window.addEventListener('message', _invDashMsgHandler);
}

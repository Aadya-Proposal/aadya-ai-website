const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log('PASS', message); }
let skips = 0;
function skip(message) { skips++; console.log('SKIP', message); }
// The shipped flag decides which proposal-download checks run. PROPOSAL_DOWNLOADS=on
// serves the script with the flag forced on, to test the feature before enabling it.
const forceDownloadsOn = process.env.PROPOSAL_DOWNLOADS === 'on';
const proposalScript = () => {
 const source = fs.readFileSync(path.join(root, 'js/proposal-downloads.js'), 'utf8');
 return forceDownloadsOn ? source.replace('const PROPOSAL_DOWNLOADS_ENABLED = false;', 'const PROPOSAL_DOWNLOADS_ENABLED = true;') : source;
};
const context = vm.createContext({ console, URL });
vm.runInContext(fs.readFileSync(path.join(root, 'js/document-usage.js'), 'utf8'), context);
check(vm.runInContext("getPlanLimit('starter') === 20 && getPlanLimit('free') === 3 && getPlanLimit('pro') === Infinity", context), 'one allowance definition');
check(vm.runInContext("formatDocumentUsage(2, 3) === '2 of 3 documents used this month' && formatDocumentUsage(1, Infinity) === '1 document this month — unlimited on Pro'", context), 'usage label says per month');
vm.runInContext(proposalScript(), context);
const downloadsEnabled = vm.runInContext('PROPOSAL_DOWNLOADS_ENABLED', context);
console.log('PROPOSAL_DOWNLOADS_ENABLED =', downloadsEnabled);
check(vm.runInContext("proposalObjectPath({pdf_path:'a/token.pdf'},'a') === 'a/token.pdf'", context), 'owner folder accepted');
for (const value of ['b/token.pdf', 'token.pdf', 'a/../b.pdf', 'a/%2e%2e.pdf', 'a/x.pdf?token=secret']) {
 context.input = value;
 check(vm.runInContext("proposalObjectPath({pdf_path:input},'a') === null", context), 'reject unsafe or foreign proposal path: ' + value);
}
for (const file of ['dashboard.html','invoices.html','invoice.html','receipt.html','index.html','account.html']) {
 for (const match of fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new Function(match[1]);
}
check(true, 'all modified inline scripts parse');
for (const file of ['dashboard.html','invoices.html','invoice.html','receipt.html','index.html','account.html','checkout-links.js','js/document-usage.js']) {
 const source = fs.readFileSync(path.join(root,file),'utf8');
 check(!/documents_used\s*(?:[+\-]?=|:)|\.(?:update|upsert|insert)\(\{[^}]*documents_used/.test(source), 'browser never writes or resets documents_used: ' + file);
 check(!/no time limit|included in your (?:current )?plan|shared documents|billing period[^.]*documents/i.test(source), 'no total or billing-period allowance wording: ' + file);
}
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const page = await browser.newPage({ viewport: {width:1280,height:900} });
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
   window.__fixture = { used:20, plan:'starter', failUsage:false, failPayment:false, failReceipt:false, updates:0, posts:[], signed:[], razor:0,
    user:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'},
    invoices:[{id:'22222222-2222-4222-8222-222222222222',user_email:'owner@example.test',invoice_number:'INV-13',client_name:'Client',client_email:'client@example.test',project_name:'Design <review>',amount:500,currency:'USD',status:'sent',pdf_path:'11111111-1111-4111-8111-111111111111/invoice.pdf',created_at:'2026-10-03'}],
    receipts:[],profile:{business_name:'Studio',business_email:'owner@example.test',business_address:'Paris',tax_id:'',logo_url:null},
    proposals:[{id:'p1',client_name:'Client',proposal_title:'Scope',created_at:'2026-10-03',pdf_path:'11111111-1111-4111-8111-111111111111/token.pdf'}]};
   const client = {
    auth:{getSession:async()=>({data:{session:{user:__fixture.user}}}),onAuthStateChange:fn=>{setTimeout(()=>fn('INITIAL_SESSION',{user:__fixture.user}),0);return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},
    from(table) {
     let update=null, head=false, column='';
     const q={select(c,opts){column=c;head=!!opts?.head;return q},eq(){return q},gte(){return q},order(){return q},limit(){return q},update(v){update=v;return q},upsert(v){update=v;return q},insert(v){update=v;return q},
      maybeSingle(){return Promise.resolve(result(true))},single(){return Promise.resolve(result(true))},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject)}};
     function result(single) {
      if(table==='users') {if(__fixture.failUsage)return {data:null,error:{message:'offline'}};return {data:{name:'Owner',plan:__fixture.plan,documents_used:__fixture.used,...__fixture.profile},error:null};}
      if(table==='invoices' && update){__fixture.updates++;if(__fixture.failPayment)return {data:null,error:{message:'denied'}};__fixture.invoices[0].status=update.status;return {data:{id:__fixture.invoices[0].id},error:null};}
      const rows=__fixture[table]||[];return {data:head?null:single?rows[0]:rows,count:rows.length,error:null};
     }
     return q;
    },storage:{from(bucket){return {createSignedUrl:async(p,seconds,options)=>{__fixture.signed.push({bucket,p,seconds,options});return {data:{signedUrl:'https://aadya.test/download.pdf'},error:null}},upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'https://aadya.test/logo.png'}})}}}
   };
   window.supabase={createClient:()=>client};
   window.Razorpay=function(options){this.open=()=>{__fixture.razor++;__fixture.razorOptions=options}};
   window.__alerts=[]; window.alert=message=>__alerts.push(message);
  });
  await page.route('**/*', async route => {
   const u=new URL(route.request().url());
   if(u.hostname==='aadya.test') {
    if(u.pathname==='/download.pdf') return route.fulfill({status:200,contentType:'application/pdf',body:'test',headers:{'content-disposition':'attachment; filename="test.pdf"'}});
    let file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1)); if(!path.extname(file))file+='.html';
    if(file===path.join(root,'js','proposal-downloads.js'))return route.fulfill({body:proposalScript(),contentType:'application/javascript'});
    if(fs.existsSync(file))return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':undefined});
    return route.fulfill({status:404,body:''});
   }
   if(u.hostname==='hook.eu1.make.com') {
    if(u.pathname.includes('7bozgkt')) return route.fulfill({json:{subscription_id:'sub_test'}});
    const payload=route.request().postDataJSON();
    const failed=await page.evaluate(p=>{__fixture.posts.push(p);return __fixture.failReceipt},payload);
    return route.fulfill({status:failed?500:200,json:{ok:!failed}});
   }
   // No live analytics, storage, email, payment or third-party network calls.
   if(route.request().resourceType()==='script')return route.fulfill({contentType:'application/javascript',body:''});
   return route.fulfill({status:200,body:''});
  });
  const invoiceId='22222222-2222-4222-8222-222222222222';
  await page.goto('https://aadya.test/invoices');
  await page.waitForSelector('#invoiceTableBody .mark-paid-btn');
  check((await page.locator('#invUsedSub').innerText()).includes('of 20 documents used this month'), 'invoice page shows monthly allowance');
  await page.evaluate(()=>generateInvoice());
  check(await page.locator('#regionalCheckout').isVisible(), 'invoice blocked at shared limit offers regional upgrade');
  await page.locator('[data-close]').click();
  await page.locator('#invoiceTableBody .mark-paid-btn').click();
  check(await page.locator('#rmCreateReceipt').isChecked(), 'free receipt selected by default');
  check(!(await page.locator('#rmBusinessDetails').getAttribute('open')), 'saved business fields collapsed');
  await page.locator('#rmPaymentMethod').selectOption('bank_transfer');
  await page.evaluate(()=>__fixture.failReceipt=true);
  await page.locator('#rmSubmitBtn').click();
  await page.waitForFunction(()=>__fixture.posts.length===1 && !document.getElementById('rmSubmitBtn').disabled);
  check(await page.evaluate(()=>__fixture.invoices[0].status==='paid' && __fixture.updates===1), 'receipt failure preserves recorded payment');
  const first=await page.evaluate(()=>__fixture.posts[0]);
  check(first.flow==='convert_from_invoice' && first.line_items[0].amount===500 && first.line_items_html.includes('&lt;review&gt;'), 'receipt payload is free linked flow with escaped line item');
  check(first.invoice_id===invoiceId && await page.evaluate(()=>__fixture.used===20), 'invoice-linked receipt is sent at the monthly limit and does not modify allowance');
  await page.locator('#rmCancelBtn').click();
  await page.reload();await page.waitForSelector('#invoiceTableBody .mark-paid-btn');
  // The mock DB resets on reload; restore the persisted paid status to model the backend.
  await page.evaluate(()=>{__fixture.invoices[0].status='paid';currentInvoices[0].status='paid';renderTable(currentInvoices)});
  await page.locator('#invoiceTableBody .mark-paid-btn').click();
  check(await page.locator('#receiptModal').getAttribute('data-client-id')===first.client_id,'receipt retry ID survives close and reload');
  await page.locator('#rmSubmitBtn').click();
  await page.waitForFunction(()=>__fixture.posts.length===1);
  check(await page.evaluate(()=>__fixture.updates===0), 'retry does not record payment again');
  check(await page.evaluate(()=>__fixture.posts[0].client_id)===first.client_id,'retry reuses webhook idempotency ID');
  await page.waitForSelector('#receiptModal',{state:'detached'});
  check((await page.locator('#invoiceTableBody').innerText()).includes('Receipt processing'),'accepted request shows processing rather than completion');
  await page.evaluate(()=>{__fixture.receipts=[{id:'receipt',invoice_id:__fixture.invoices[0].id,pdf_url:'https://aadya.test/download.pdf',amount:500,currency:'USD'}];return start()});
  check((await page.locator('#invoiceTableBody').innerText()).includes('Download receipt'),'completed receipt accessible beside invoice');
  // Legacy receipt row (pdf_url null) that nobody requested from this browser.
  await page.evaluate(()=>{sessionStorage.clear();__fixture.receipts=[{id:'legacy-receipt',invoice_id:__fixture.invoices[0].id,pdf_url:null,amount:500,currency:'USD',created_at:'2026-08-12'}];return start()});
  const legacyRow=await page.locator('#invoiceTableBody').innerText();
  check(legacyRow.includes('✓ Paid · Receipt saved') && !legacyRow.includes('Receipt processing') && !legacyRow.includes('Download receipt') && !legacyRow.includes('Refresh'),'legacy receipt with null pdf_url shows saved, not processing');
  check(await page.locator('#invoiceTableBody .mark-paid-btn').count()===0,'legacy receipt row offers no Record payment or Create receipt');
  // A row exists, so even a request still marked submitted in this browser is not processing.
  await page.evaluate(()=>{receiptRequest(__fixture.invoices[0].id,{clientId:'x',state:'submitted'});return start()});
  check(!(await page.locator('#invoiceTableBody').innerText()).includes('Receipt processing'),'persisted receipt row overrides local processing state');
  // Fresh state for mark-paid-only.
  await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.waitForSelector('#invoiceTableBody .mark-paid-btn');
  await page.locator('#invoiceTableBody .mark-paid-btn').click();await page.locator('#rmCreateReceipt').uncheck();
  check(await page.locator('#rmReceiptFields').isHidden(),'mark-paid-only hides receipt-specific fields');
  await page.locator('#rmSubmitBtn').click();await page.waitForSelector('#receiptModal',{state:'detached'});
  check(await page.evaluate(()=>__fixture.updates===1 && __fixture.posts.length===0),'mark-paid-only does not request a receipt');
  await page.evaluate(()=>{__fixture.failUsage=true;return generateInvoice()});
  check(await page.locator('#invoicePopupOverlay').count()===0,'usage read failure does not bypass generation gate');
  await page.evaluate(()=>{__fixture.failUsage=false;__fixture.used=19;return generateInvoice()});
  check(await page.locator('#invoicePopupOverlay').count()===1,'Starter can generate at 19 shared documents');
  await page.locator('#invoicePopupCloseBtn').click();
  await page.evaluate(()=>{__fixture.plan='pro';__fixture.used=100;return generateInvoice()});
  check(await page.locator('#invoicePopupOverlay').count()===1,'Pro generation remains unlimited');
  await page.locator('#invoicePopupCloseBtn').click();
  await page.evaluate(()=>{__fixture.plan='free';__fixture.used=3;return generateInvoice()});
  check(await page.locator('#regionalCheckout').isVisible(),'Free blocks at three shared documents');
  await page.locator('[data-close]').click();
  await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.waitForSelector('#invoiceTableBody .mark-paid-btn');
  await page.locator('#invoiceTableBody .mark-paid-btn').click();await page.locator('#rmPaymentMethod').selectOption('cash');
  await page.evaluate(()=>__fixture.failPayment=true);await page.locator('#rmSubmitBtn').click();
  await page.waitForFunction(()=>__fixture.updates===1 && !document.getElementById('rmSubmitBtn').disabled);
  check(await page.evaluate(()=>__fixture.posts.length===0 && __fixture.invoices[0].status==='sent'),'failed payment update cannot send receipt');
  await page.locator('#rmCancelBtn').click();
  // Mobile modal and paid actions.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(id=>openReceiptModal(id),invoiceId);
  await page.screenshot({path:path.join(process.env.TEMP||root,'aadya-receipt-mobile.png')});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile receipt flow has no horizontal overflow');
  await page.screenshot({path:path.join(process.env.TEMP||root,'aadya-receipt-mobile.png')});
  await page.goto('https://aadya.test/dashboard');await page.waitForSelector('.history-item');
  await page.waitForFunction(()=>document.getElementById('docsLimit').textContent.includes('this month'));
  check((await page.locator('#docsLimit').innerText()).includes('of 20 this month'),'dashboard usage label is monthly');
  await page.evaluate(()=>showInvoiceUpgradeModal(20,'starter','owner@example.test'));
  await page.locator('#invoiceUpgradeCtaBtn').click();
  check(await page.locator('#regionalCheckout [data-region="usd"]').isVisible(),'dashboard upgrades expose international checkout');
  await page.locator('[data-region="inr"]').click();await page.waitForFunction(()=>__fixture.razor===1);
  check(await page.evaluate(()=>__fixture.razorOptions.subscription_id==='sub_test'),'India choice opens fresh Razorpay subscription');
  await page.evaluate(()=>showRegionalUpgrade('starter','owner@example.test'));
  const navigation=page.waitForURL('https://aadya-proposals.lemonsqueezy.com/**');
  await page.locator('[data-region="usd"]').click();await navigation;
  check(new URL(page.url()).searchParams.get('checkout[email]')==='owner@example.test','international checkout prefills account email');
  await page.goto('https://aadya.test/dashboard');await page.waitForSelector('.history-item');
  if (downloadsEnabled) {
   const download=page.waitForEvent('download');await page.locator('.history-download').click();await download;
   check(await page.evaluate(()=>__fixture.signed[0].bucket==='proposals' && __fixture.signed[0].seconds===60),'proposal Download creates 60-second signed URL');
   await page.evaluate(()=>{const p={...__fixture.proposals[0],pdf_path:'another-user/token.pdf'};renderProposalHistory(supabase.createClient(),[p])});
   await page.locator('.history-download').click();
   check(await page.evaluate(()=>__fixture.signed.length===1 && __alerts.length>0),'foreign path never reaches signing API');
  } else {
   skip('proposal Download creates 60-second signed URL (PROPOSAL_DOWNLOADS_ENABLED is false)');
   skip('foreign path never reaches signing API (PROPOSAL_DOWNLOADS_ENABLED is false)');
   await page.evaluate(()=>renderProposalHistory(supabase.createClient(),[__fixture.proposals[0],{...__fixture.proposals[0],id:'legacy',pdf_path:null,pdf_url:'https://aadya.test/legacy.pdf'}]));
   const history=await page.locator('#historyContainer').innerText();
   check(await page.locator('#historyContainer .history-item').count()===2 && await page.locator('#historyContainer button, #historyContainer a').count()===0 && !history.includes('Download'),'flag off: proposal history shows no download button, link or notice');
   await page.evaluate(()=>downloadProposal(supabase.createClient(),__fixture.proposals[0],document.createElement('button')));
   check(await page.evaluate(()=>__fixture.signed.length===0),'flag off: no Storage calls for proposals');
  }
  await page.goto('https://aadya.test/receipt');
  await page.waitForFunction(()=>typeof rcptSubmit==='function');
  await page.evaluate(()=>rcptSubmit({preventDefault(){}}));
  check((await page.locator('#receiptFormMsg').innerText()).includes('20 of 20 documents in your plan this month') && await page.evaluate(()=>__fixture.posts.length===0),'standalone receipt respects exhausted shared allowance');
  await page.goto('https://aadya.test/');
  await page.waitForFunction(()=>typeof openInvoicePopup==='function' && typeof readDocumentUsage==='function');
  await page.evaluate(()=>openInvoicePopup());
  check(await page.locator('#regionalCheckout').isVisible() && await page.locator('#invoicePopupOverlay').count()===0,'homepage invoice entry cannot bypass allowance');
  await page.locator('[data-close]').click();await page.evaluate(()=>openModal());
  check(await page.locator('#regionalCheckout').isVisible() && !(await page.locator('#proposalModal').getAttribute('class')).includes('open'),'homepage proposal entry cannot bypass allowance');
  check(errors.length===0,'no browser script errors: '+errors.join('; '));
  console.log(`${checks} checks passed, ${skips} skipped. All external effects mocked.`);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

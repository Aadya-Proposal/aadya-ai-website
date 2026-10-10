# Batch one: deployment prerequisites and verification

Frontend work is local only. No SQL, Make changes, file migration, purchase or deployment has been executed.

## Monthly document allowance

Decision: Free 3 documents per calendar month (UTC), Starter 20 per calendar month, Pro unlimited. Proposals (including SOWs), invoices and standalone receipts share this allowance.

The database owns the count. `upsert_user_doc_count()` recomputes `users.documents_used` as invoices + proposals + standalone receipts (`invoice_id` is null) created since the 1st of the current month (UTC), and a daily recount corrects any drift. The count therefore drops back at the start of each month without any subscription-renewal or browser reset logic.

The browser only reads `documents_used` (`js/document-usage.js`). It never increments, decrements or resets it. Every usage label says "this month", e.g. "2 of 3 documents used this month"; limit prompts say the allowance resets on the 1st (UTC).

Receipts created from an invoice (Record payment, `flow: convert_from_invoice`, `invoice_id` set) are never blocked by the allowance check and are excluded from the count.

Browser checks are UX, not security: Fillout URLs can be opened directly. Make/backend should refuse a new chargeable document when the current month's count is at the plan limit. Confirm SOWs are stored in `proposals` (so they are counted) and that a failed generation leaves no row behind (so it does not consume the allowance).

## Proposal storage prerequisite (do not deploy download UI first)

1. Export the proposals rows, inspect existing Storage policies, and confirm files really are `<token>.pdf` inside the PRIVATE proposals bucket. Account ownership must be verified against trusted historical Make/Fillout records. The migration uses `user_email` as an initial mapping only; if rows were tampered with, that is not proof of original ownership. Resolve disputed/missing owners manually.
2. Review and manually run `sql/proposal-private-downloads.sql`. It adds `pdf_path`, keeps the bucket private, grants user-folder reads and adds restrictive guards against older broad policies. Anonymous reads and browser writes to proposals remain denied. Other buckets are unaffected. Existing restrictive policies can still deny legitimate reads; inspect them rather than deleting them blindly.
3. In the proposals/SOW Make scenario, use the existing service-role-only UID lookup (or a trusted existing auth UID). Stop the route if the lookup is empty. Never use an unverified form-supplied UID.
4. Use ONLY native Supabase **Upload a File**, connection **My Supabase connection**, bucket `proposals`, object filename `{{uid}}/{{proposal_token}}.pdf`, data = existing PDF binary. Preserve the existing email/approval route and map the path to `proposals.pdf_path` only after upload succeeds. Do not save a signed URL. Do not place service-role keys in Make HTTP modules.
5. For existing documents, install `@supabase/supabase-js` in an isolated local tools directory, expose it via `NODE_PATH`, and set `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` in the local environment (never commit keys). Run `node scripts/migrate-proposal-pdfs.cjs` for a dry-run. It reads source files but makes no changes. Review every mapping and blocked row.
6. After reviewing the mapping, run the same command with `--apply`. The script copies each source into its owner's folder, downloads both to compare SHA-256 hashes, and updates `pdf_path` only after verification. Original files stay intact. A pre-existing destination must have identical bytes. Conflicting cross-account source mappings are blocked. It is rerunnable; already mapped rows are skipped and failures return a nonzero exit status.
7. Test user A can sign/download A's file; user B cannot sign A's path even by editing B's proposal row. Confirm anonymous reads fail and browser writes fail. Test through Storage itself, not only the UI's path guard.
8. Deploy the frontend only after migration and new-generation mapping work. Old documents lacking `pdf_path` show “Download not available”; they are not regenerated or publicly exposed.
9. After an agreed retention period and verification of every migrated file, separately approve removal of old flat objects through Storage API. The supplied script never deletes originals and never edits storage.objects directly. Keep pdf_url until email/approval dependencies have been audited.

## Checkout

Dashboard limit prompts and invoice-page limits offer India (Razorpay, INR) and EU/US (Lemon Squeezy, USD). Timezone does not silently choose billing region. Lemon checkout receives the signed-in email as a prefill; server-side webhook/account matching is still required. Test mismatched checkout emails, cancellation, duplicate webhook delivery, activation and renewals for both providers. Do not claim EUR pricing: international plans in current configuration are USD.

## Payment and receipt

Record payment opens one modal for full payment, with receipt generation checked by default. Business details are collapsed when already saved. Mark-paid-only does not create a receipt or persist date/method (there are no verified payment-detail columns); those controls are hidden in that mode. Receipt requests carry payment date/method as before.

Payment state is saved before requesting the receipt. If the receipt request fails, the invoice stays paid. Retry uses the same client_id within the tab, including reloads. The Make receipt scenario must deduplicate that client_id, store invoice_id on the receipt (so it is excluded from documents_used), and also prevent duplicate receipts per invoice across tabs/devices. The frontend cannot make the database update and webhook atomic. After an accepted webhook request, the UI shows “Receipt processing”; returning to the page or Refresh reloads the persisted receipt. An accepted-but-failed Make run requires backend retry with the same ID; the UI does not blindly resend accepted requests.

Receipt downloads reuse the current stored receipt URL. This batch does not migrate receipt storage. Confirm these URLs work and have the intended privacy model before rollout.

## Acceptance checks

- Free allowance (3 this month) exhausted by any combination of product types blocks a new chargeable document; the same account can generate again after the 1st (UTC).
- Starter at 19 allows one more; at 20 blocks invoice/proposal/standalone receipt entry. Pro is unlimited.
- Invoice-linked receipt succeeds at the monthly limit and does not change documents_used.
- Every usage label and limit prompt says "this month"; none says "total" or "billing period".
- India checkout uses Razorpay; EU/US choice never calls the Razorpay webhook.
- Paid invoice plus failed receipt remains paid, and retry keeps its idempotency ID.
- Mark-paid-only sends no receipt webhook.
- Download invoice remains visible after payment, on desktop and mobile.
- Completed receipt appears beside its invoice; processing state does not claim completion.
- Business and project text with HTML characters renders as text.
- Sign-out/session-expiry and failed usage reads do not open unrestricted authenticated generation forms.

## Local regression test

Run `node tests/batch-one.cjs` with Playwright available through your Node module path and Microsoft Edge installed. It intercepts all requests and mocks Supabase, Make and payments; it never purchases, emails or changes live data. Run `node tests/proposal-migration.cjs` for migration safety checks with in-memory Storage. Neither test runs SQL.

Validation completed locally: 55 browser/logic checks plus 4 migration safety checks passed. Real Storage RLS, production checkout activation and Make execution remain to be verified after the manual backend steps.

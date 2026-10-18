-- Receipt PDFs: make the 'documents' bucket private.
-- The bucket holds only receipt PDFs (flat file names). receipts.pdf_url keeps the
-- public-style URL; the dashboard signs a short-lived link from its file name.

-- STEP 1 — safe to run any time (bucket still public, nothing changes for users).
begin;
-- A signed-in user may read a receipt file only if one of their own receipts points at it.
drop policy if exists "receipt_owner_read" on storage.objects;
create policy "receipt_owner_read" on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.receipts r
    where r.user_email = (select auth.jwt() ->> 'email')
      and r.pdf_url = 'https://rscpsmwqtkduahhaejtv.supabase.co/storage/v1/object/public/documents/' || name
  )
);
-- Guards (restrictive, so they also constrain any broader policy added later).
drop policy if exists "receipt_anon_guard" on storage.objects;
create policy "receipt_anon_guard" on storage.objects as restrictive for select to anon
using (bucket_id <> 'documents');
-- Only Make (service role) writes receipt files.
drop policy if exists "receipt_insert_guard" on storage.objects;
create policy "receipt_insert_guard" on storage.objects as restrictive for insert to authenticated, anon
with check (bucket_id <> 'documents');
drop policy if exists "receipt_update_guard" on storage.objects;
create policy "receipt_update_guard" on storage.objects as restrictive for update to authenticated, anon
using (bucket_id <> 'documents') with check (bucket_id <> 'documents');
drop policy if exists "receipt_delete_guard" on storage.objects;
create policy "receipt_delete_guard" on storage.objects as restrictive for delete to authenticated, anon
using (bucket_id <> 'documents');
commit;

-- STEP 2 — only after the new invoices.html is live (old public links stop working).
-- update storage.buckets set public = false where id = 'documents';

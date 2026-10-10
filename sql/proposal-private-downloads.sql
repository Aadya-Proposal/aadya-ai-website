-- REVIEW ONLY: run manually in Supabase before migrating files/deploying the frontend.
begin;
alter table public.proposals add column if not exists pdf_path text;
insert into storage.buckets (id, name, public)
values ('proposals', 'proposals', false)
on conflict (id) do update set public = false;

-- Permissive policies are ORed. Restrictive guards also constrain any older broad policies.
drop policy if exists "proposal_folder_read" on storage.objects;
create policy "proposal_folder_read" on storage.objects for select to authenticated
using (bucket_id = 'proposals' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "proposal_read_guard" on storage.objects;
create policy "proposal_read_guard" on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'proposals' or (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "proposal_anon_guard" on storage.objects;
create policy "proposal_anon_guard" on storage.objects as restrictive for select to anon
using (bucket_id <> 'proposals');

-- Make's service-role connection writes. Browser users cannot overwrite or copy files.
drop policy if exists "proposal_insert_guard" on storage.objects;
create policy "proposal_insert_guard" on storage.objects as restrictive for insert to authenticated, anon
with check (bucket_id <> 'proposals');
drop policy if exists "proposal_update_guard" on storage.objects;
create policy "proposal_update_guard" on storage.objects as restrictive for update to authenticated, anon
using (bucket_id <> 'proposals') with check (bucket_id <> 'proposals');
drop policy if exists "proposal_delete_guard" on storage.objects;
create policy "proposal_delete_guard" on storage.objects as restrictive for delete to authenticated, anon
using (bucket_id <> 'proposals');
commit;

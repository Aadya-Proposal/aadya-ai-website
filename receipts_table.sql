-- New table for the Receipt feature. Run this in the Supabase SQL editor.
-- Mirrors the shape/conventions of the existing `invoices` table.

create table public.receipts (
  id uuid not null default gen_random_uuid(),
  user_email text not null,
  invoice_id uuid null references public.invoices(id),  -- null for standalone receipts (Part 1)
  receipt_number text null,
  payer_name text null,
  payer_email text null,
  from_name text null,
  from_email text null,
  from_tax_id text null,
  from_address text null,
  from_logo_url text null,
  payment_date date null,
  payment_method text null,   -- 'cash' | 'bank_transfer' | 'upi' | 'card' | 'other'
  amount numeric null,
  currency text null default 'INR'::text,   -- 'INR' | 'USD' | 'EUR'
  line_items jsonb null,
  template text null default 'corporate'::text,  -- 'corporate' | 'creative' | 'classic'
  created_at timestamp without time zone null default now(),
  constraint receipts_pkey primary key (id)
);

alter table public.receipts enable row level security;

-- Mirrors the real "Users see own invoices" policy on public.invoices exactly:
-- a single ALL-command policy, scoped to public, gated on user_email = the
-- JWT's email claim. Keeps access control consistent across every table.
create policy "Users see own receipts"
on public.receipts
to public
using (
  (user_email = (auth.jwt() ->> 'email'::text))
);

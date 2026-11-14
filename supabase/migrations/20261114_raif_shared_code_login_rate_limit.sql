create table if not exists public.raif_access_attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists raif_access_attempts_fingerprint_created_idx
  on public.raif_access_attempts (fingerprint, created_at desc);
alter table public.raif_access_attempts enable row level security;
revoke all on table public.raif_access_attempts from anon, authenticated;

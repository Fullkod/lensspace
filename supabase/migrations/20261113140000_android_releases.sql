-- LEN0012 (decision D6, Roberto 2026-11-13): the LensSpace Android APK is distributed from Supabase
-- Storage, like Kshop, and only the latest version is kept. scripts/android-publish.mjs uploads
-- the APK, writes its row and removes the older ones; the installed app reads the row to offer
-- the update. Public on purpose: the APK and its version are not tenant data.

create table public.android_releases (
  version_code integer primary key check (version_code > 0),
  version_name text not null check (char_length(version_name) between 1 and 40),
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  -- Installed versions below this one must update before using the app.
  min_supported_version_code integer not null default 1 check (min_supported_version_code > 0),
  published_at timestamptz not null default now()
);
comment on table public.android_releases is 'LEN0012: published LensSpace Android APK (only the latest is kept); written only by the publish script with the service role.';

alter table public.android_releases enable row level security;
create policy android_releases_read on public.android_releases for select to anon, authenticated using (true);
revoke all on table public.android_releases from anon, authenticated;
grant select on table public.android_releases to anon, authenticated;

-- Public bucket: anyone can download the APK by its URL; only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('android-app', 'android-app', true, 52428800, array['application/vnd.android.package-archive'])
on conflict (id) do nothing;

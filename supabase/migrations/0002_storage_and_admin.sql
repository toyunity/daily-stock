-- Storage bucket for generated report images + admin management policies.

-- Public bucket for rendered report cards / AI header images.
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do nothing;

-- Anyone can read report images (they are non-sensitive, shareable cards).
create policy "public read report images" on storage.objects
  for select using (bucket_id = 'report-images');

-- Only the service role (pipeline) writes; no insert/update policy for anon/auth
-- means the client cannot write. Service role bypasses RLS.

-- Admin can approve/manage any profile (approval gate management from the UI).
create policy "admin update any profile" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin read all profiles" on public.profiles
  for select using (public.is_admin());

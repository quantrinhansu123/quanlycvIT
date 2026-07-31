-- Production RLS cleanup.
-- API requests now forward the Supabase access token, so the temporary anon
-- policies and grants used during development can be removed safely.

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '%_anon_dev'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- All application data is served by Next.js API routes with a forwarded JWT.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;

-- These policies were deliberately open to anon for development. Keep report
-- attachments available to signed-in users only.
alter policy "bao_cao_storage_select" on storage.objects to authenticated;
alter policy "bao_cao_storage_insert" on storage.objects to authenticated;
alter policy "bao_cao_storage_delete" on storage.objects to authenticated;

-- Pin search_path on set_updated_at() to prevent search-path hijacking.
-- The function uses only now() (pg_catalog, always implicit) and NEW (trigger
-- variable), so the empty path is safe. All 16 existing triggers are unaffected.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke direct RPC access to the SECURITY DEFINER new-user bootstrap function.
-- It is meant to fire only via the on_auth_user_created trigger on auth.users,
-- which runs as the trigger owner (postgres) and is unaffected by this revoke.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

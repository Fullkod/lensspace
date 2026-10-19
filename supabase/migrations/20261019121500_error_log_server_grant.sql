-- LEN0001: the Next.js server reports without a user session (anon key + ingest
-- secret), so signed-in users never need the server entry point.
revoke execute on function public.record_server_error(text, jsonb) from authenticated;

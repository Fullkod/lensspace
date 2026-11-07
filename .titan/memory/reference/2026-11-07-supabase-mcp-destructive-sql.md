# Supabase MCP auto-declines destructive SQL; use the CLI

Date: 2026-11-07

The Supabase MCP asks for an extra confirmation on destructive statements (any
`DELETE`/`DROP`, even inside a function body). In the Claude Code VS Code extension that
prompt is never shown and comes back as "declined" without the user doing anything.
Non-destructive `apply_migration` / `execute_sql` calls work normally.

Workaround: keep the migration in `supabase/migrations/` and apply it with
`npx supabase db push --remote --dry-run` (check it lists only the new file), then
`npx supabase db push --remote --yes`. `migration list` needs `--remote`; without it
the CLI targets the local Docker stack.

History drift fixed the same day: `repair_catalog_utf8_text` was `20260913224717`
locally and `20260913224749` remotely (same SQL); the local file was renamed so
`db push` only sees new migrations. When applying through the MCP, save the local
file with the version the MCP assigned (`list_migrations`).

-- adds scraped-download support to the existing movies table.
-- does not touch existing RLS or lawful-catalogue columns.

alter table public.movies
  add column if not exists topic_id   bigint unique,
  add column if not exists downloads  jsonb not null default '[]'::jsonb,
  add column if not exists source_url text;

create index if not exists movies_topic_id_idx on public.movies (topic_id);

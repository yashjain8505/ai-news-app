-- Supabase is the scheduler for every GitHub Actions workflow (pg_cron + pg_net).
-- GitHub's own `schedule:` cron silently skipped every run on 2026-09-11, so
-- the crons in the workflow files are now only a backup; these fire on time.
-- Applied live via the Supabase MCP on 2026-09-11 (migrations
-- github_dispatch_scheduler + github_dispatch_curator); kept here as the
-- record. The GitHub token lives ONLY in Vault as `github_dispatch_token`
-- (fine-grained PAT, repo ai-news-app, Actions: read+write, expires 2027-09).
--
-- Health check:   select * from gh_dispatch_health limit 20;
-- Manual poke:    select gh_dispatch('social-posts.yml');
-- Jobs:           select jobname, schedule, active from cron.job;
-- Pause one:      select cron.unschedule('gh-social-posts');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.gh_dispatch_log (
  id bigserial primary key,
  fired_at timestamptz not null default now(),
  workflow text not null,
  request_id bigint
);
alter table public.gh_dispatch_log enable row level security;

create or replace function public.gh_dispatch(workflow text, inputs jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer
set search_path = public, extensions, vault as $$
declare token text; req_id bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets
   where name = 'github_dispatch_token' limit 1;
  if token is null then raise exception 'github_dispatch_token missing from vault'; end if;
  select net.http_post(
    url := 'https://api.github.com/repos/yashjain8505/ai-news-app/actions/workflows/' || workflow || '/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json', 'Content-Type', 'application/json',
      'User-Agent', 'wortins-scheduler'),
    body := jsonb_build_object('ref', 'main', 'inputs', inputs),
    timeout_milliseconds := 15000) into req_id;
  insert into public.gh_dispatch_log (workflow, request_id) values (workflow, req_id);
  return req_id;
end $$;
revoke all on function public.gh_dispatch(text, jsonb) from public, anon, authenticated;

create or replace view public.gh_dispatch_health as
select l.fired_at, l.workflow, r.status_code,
       case when r.status_code = 204 then 'ok'
            else coalesce(left(r.content::text, 120), r.error_msg, 'no response yet') end as result
  from public.gh_dispatch_log l
  left join net._http_response r on r.id = l.request_id
 order by l.fired_at desc;

-- Schedules are UTC (IST = UTC + 5:30).
select cron.schedule('gh-daily-edition-morning', '30 1 * * *',  $$select public.gh_dispatch('daily-edition.yml')$$);                                   -- 07:00 IST
select cron.schedule('gh-daily-edition-midday',  '30 7 * * *',  $$select public.gh_dispatch('daily-edition.yml', '{"skip_articles":"true"}'::jsonb)$$); -- 13:00 IST
select cron.schedule('gh-daily-edition-evening', '30 12 * * *', $$select public.gh_dispatch('daily-edition.yml')$$);                                   -- 18:00 IST
select cron.schedule('gh-daily-newsletter',      '5 2,8 * * *', $$select public.gh_dispatch('daily-newsletter.yml')$$);                                -- 07:35 / 13:35 IST
select cron.schedule('gh-social-posts',          '35 3,7,11 * * *', $$select public.gh_dispatch('social-posts.yml')$$);                                -- 09:05 / 13:05 / 17:05 IST
select cron.schedule('gh-bluesky-replies',       '5 3,5,7,9,11,13,15 * * *', $$select public.gh_dispatch('bluesky-replies.yml')$$);                    -- 08:35-20:35 IST every 2h

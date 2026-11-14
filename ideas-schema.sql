create table public.bot_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null check (char_length(btrim(description)) between 10 and 500),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.bot_idea_votes (
  idea_id uuid not null references public.bot_ideas(id) on delete cascade,
  voter_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (idea_id, voter_id)
);

alter table public.bot_ideas enable row level security;
alter table public.bot_idea_votes enable row level security;
revoke all on public.bot_ideas, public.bot_idea_votes from anon, authenticated;

create function public.list_bot_ideas()
returns table (id uuid, title text, description text, created_at timestamptz, votes bigint, has_voted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.title, i.description, i.created_at,
         count(v.voter_id) as votes,
         coalesce(bool_or(v.voter_id = (select auth.uid())), false) as has_voted
  from public.bot_ideas i
  left join public.bot_idea_votes v on v.idea_id = i.id
  group by i.id
  order by votes desc, i.created_at desc, i.id
  limit 100;
$$;

create function public.submit_bot_idea(idea_title text, idea_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  visitor_id uuid := auth.uid();
  new_id uuid;
begin
  if visitor_id is null then
    raise exception 'Sign-in required';
  end if;
  if exists (
    select 1 from public.bot_ideas
    where author_id = visitor_id and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait a minute before submitting another idea';
  end if;
  insert into public.bot_ideas (title, description, author_id)
  values (btrim(idea_title), btrim(idea_description), visitor_id)
  returning id into new_id;
  return new_id;
end;
$$;

create function public.vote_for_bot_idea(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;
  insert into public.bot_idea_votes (idea_id, voter_id)
  values (target_id, auth.uid())
  on conflict (idea_id, voter_id) do nothing;
end;
$$;

revoke all on function public.list_bot_ideas() from public;
revoke all on function public.submit_bot_idea(text, text) from public;
revoke all on function public.vote_for_bot_idea(uuid) from public;
grant execute on function public.list_bot_ideas() to anon, authenticated;
grant execute on function public.submit_bot_idea(text, text) to authenticated;
grant execute on function public.vote_for_bot_idea(uuid) to authenticated;

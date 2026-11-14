insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-images', 'idea-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create table public.bot_idea_images (
  idea_id uuid not null references public.bot_ideas(id) on delete cascade,
  object_path text not null unique,
  position smallint not null check (position between 1 and 3),
  primary key (idea_id, position)
);

alter table public.bot_idea_images enable row level security;
revoke all on public.bot_idea_images from anon, authenticated;

create function public.can_upload_idea_image()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 3
  from storage.objects o
  where o.bucket_id = 'idea-images'
    and o.owner_id = (select auth.uid())::text
    and not exists (select 1 from public.bot_idea_images i where i.object_path = o.name);
$$;

create function public.idea_image_is_unattached(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.bot_idea_images i where i.object_path = object_name);
$$;

revoke all on function public.can_upload_idea_image() from public;
revoke all on function public.idea_image_is_unattached(text) from public;
grant execute on function public.can_upload_idea_image() to authenticated;
grant execute on function public.idea_image_is_unattached(text) to authenticated;

create policy "Upload own idea images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'idea-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and public.can_upload_idea_image()
);

create policy "Read own idea images"
on storage.objects for select to authenticated
using (bucket_id = 'idea-images' and owner_id = (select auth.uid())::text);

create policy "Remove own unattached idea images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'idea-images'
  and owner_id = (select auth.uid())::text
  and public.idea_image_is_unattached(name)
);

create function public.list_bot_ideas_with_images()
returns table (id uuid, title text, description text, created_at timestamptz, votes bigint, has_voted boolean, images text[])
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.title, i.description, i.created_at, i.votes, i.has_voted,
         coalesce((select array_agg(img.object_path order by img.position)
                   from public.bot_idea_images img where img.idea_id = i.id), '{}'::text[])
  from public.list_bot_ideas() i
  order by i.votes desc, i.created_at desc, i.id;
$$;

create function public.submit_bot_idea_with_images(idea_title text, idea_description text, image_paths text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  visitor_id uuid := auth.uid();
  new_id uuid;
  image_path text;
  image_position smallint := 0;
begin
  if visitor_id is null then
    raise exception 'Sign-in required';
  end if;
  if image_paths is null or cardinality(image_paths) > 3 then
    raise exception 'At most 3 images are allowed';
  end if;
  foreach image_path in array image_paths loop
    if image_path is null or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'idea-images' and o.name = image_path
        and o.owner_id = visitor_id::text
        and (storage.foldername(o.name))[1] = visitor_id::text
        and public.idea_image_is_unattached(o.name)
    ) then
      raise exception 'An uploaded image could not be verified';
    end if;
  end loop;
  new_id := public.submit_bot_idea(idea_title, idea_description);
  foreach image_path in array image_paths loop
    image_position := image_position + 1;
    insert into public.bot_idea_images (idea_id, object_path, position)
    values (new_id, image_path, image_position);
  end loop;
  return new_id;
end;
$$;

revoke all on function public.list_bot_ideas_with_images() from public;
revoke all on function public.submit_bot_idea_with_images(text, text, text[]) from public;
grant execute on function public.list_bot_ideas_with_images() to anon, authenticated;
grant execute on function public.submit_bot_idea_with_images(text, text, text[]) to authenticated;

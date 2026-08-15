-- =============================================
-- Realtime Location Tracker - Safe / Idempotent Schema
-- Safe to run multiple times
-- =============================================
-- 1. TABLES
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Safe upgrades if an older profiles table is missing columns
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
  ) then
    alter table public.profiles add column username text;
    update public.profiles
      set username = coalesce(split_part(email, '@', 1), id::text)
      where username is null;
    alter table public.profiles alter column username set not null;
    begin
      alter table public.profiles add constraint profiles_username_key unique (username);
    exception when duplicate_object then null;
    end;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    alter table public.profiles add column avatar_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    alter table public.profiles add column email text;
  end if;
end $$;

create table if not exists public.locations (
  user_id uuid references public.profiles (id) on delete cascade primary key,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  battery_level integer,
  is_charging boolean default false,
  updated_at timestamptz default now()
);

create table if not exists public.friendships (
  id uuid default gen_random_uuid () primary key,
  user_id uuid references public.profiles (id) on delete cascade not null,
  friend_id uuid references public.profiles (id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamptz default now(),
  unique (user_id, friend_id)
);

create table if not exists public.messages (
  id uuid default gen_random_uuid () primary key,
  sender_id uuid references public.profiles (id) on delete cascade not null,
  receiver_id uuid references public.profiles (id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.push_tokens (
  id uuid default gen_random_uuid () primary key,
  user_id uuid references public.profiles (id) on delete cascade not null,
  token text not null,
  platform text,
  updated_at timestamptz default now(),
  unique (user_id, token)
);

create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users manage own push tokens" on public.push_tokens;

drop policy if exists "Users can read tokens to notify others" on public.push_tokens;

create policy "Users manage own push tokens" on public.push_tokens for all using (auth.uid () = user_id)
with
  check (auth.uid () = user_id);

create policy "Users can read tokens to notify others" on public.push_tokens for
select
  using (auth.role () = 'authenticated');

-- 2. INDEXES
create index if not exists idx_friendships_user_id on public.friendships (user_id);

create index if not exists idx_friendships_friend_id on public.friendships (friend_id);

create index if not exists idx_friendships_status on public.friendships (status);

create index if not exists idx_messages_sender on public.messages (sender_id);

create index if not exists idx_messages_receiver on public.messages (receiver_id);

create index if not exists idx_messages_created on public.messages (created_at desc);

create index if not exists idx_locations_updated on public.locations (updated_at desc);

-- 3. REALTIME (only add if not already a member)
do $$
begin
  -- Critical for realtime avatars/usernames: without `profiles` in this
  -- publication, changes to a user's avatar_url/username are never pushed
  -- to other clients — chat, friends list, and the map all silently show
  -- stale data until the app is restarted.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'locations'
  ) then
    alter publication supabase_realtime add table public.locations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- 4. RLS
alter table public.profiles enable row level security;

alter table public.locations enable row level security;

alter table public.friendships enable row level security;

alter table public.messages enable row level security;

-- 5. POLICIES (drop first so re-runs don't fail)
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

drop policy if exists "Users can insert their own profile" on public.profiles;

drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can upsert own location" on public.locations;

drop policy if exists "Friends can read locations" on public.locations;

drop policy if exists "Users can see their friendships" on public.friendships;

drop policy if exists "Users can create friend requests" on public.friendships;

drop policy if exists "Users can update friendships they are part of" on public.friendships;

drop policy if exists "Users can delete their own friend requests" on public.friendships;

drop policy if exists "Users can read their messages" on public.messages;

drop policy if exists "Users can send messages" on public.messages;

-- Profiles
create policy "Public profiles are viewable by everyone" on public.profiles for
select
  using (true);

create policy "Users can insert their own profile" on public.profiles for insert
with
  check (auth.uid () = id);

create policy "Users can update own profile" on public.profiles
for update
  using (auth.uid () = id)
with
  check (auth.uid () = id);

-- Locations
create policy "Users can upsert own location" on public.locations for all using (auth.uid () = user_id)
with
  check (auth.uid () = user_id);

create policy "Friends can read locations" on public.locations for
select
  using (
    auth.uid () = user_id
    or exists (
      select
        1
      from
        public.friendships f
      where
        f.status = 'accepted'
        and (
          (
            f.user_id = auth.uid ()
            and f.friend_id = locations.user_id
          )
          or (
            f.friend_id = auth.uid ()
            and f.user_id = locations.user_id
          )
        )
    )
  );

-- Friendships
create policy "Users can see their friendships" on public.friendships for
select
  using (
    auth.uid () = user_id
    or auth.uid () = friend_id
  );

create policy "Users can create friend requests" on public.friendships for insert
with
  check (auth.uid () = user_id);

create policy "Users can update friendships they are part of" on public.friendships
for update
  using (
    auth.uid () = user_id
    or auth.uid () = friend_id
  );

create policy "Users can delete their own friend requests" on public.friendships for delete using (
  auth.uid () = user_id
  or auth.uid () = friend_id
);

-- Messages
create policy "Users can read their messages" on public.messages for
select
  using (
    auth.uid () = sender_id
    or auth.uid () = receiver_id
  );

create policy "Users can send messages" on public.messages for insert
with
  check (auth.uid () = sender_id);

-- 6. AUTO PROFILE ON SIGNUP
create or replace function public.handle_new_user () returns trigger language plpgsql security definer
set
  search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure public.handle_new_user ();

-- 7. STORAGE (avatars bucket for profile photos)
-- Creates a public "avatars" bucket so profile image uploads work.
insert into
  storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
values
  (
    'avatars',
    'avatars',
    true,
    5242880, -- 5 MB
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jpg'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;

drop policy if exists "Users can upload their own avatar" on storage.objects;

drop policy if exists "Users can update their own avatar" on storage.objects;

drop policy if exists "Users can delete their own avatar" on storage.objects;

create policy "Avatar images are publicly accessible" on storage.objects for
select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar" on storage.objects for insert
with
  check (
    bucket_id = 'avatars'
    and auth.uid ()::text = (storage.foldername (name)) [1]
  );

create policy "Users can update their own avatar" on storage.objects
for update
  using (
    bucket_id = 'avatars'
    and auth.uid ()::text = (storage.foldername (name)) [1]
  );

create policy "Users can delete their own avatar" on storage.objects for delete using (
  bucket_id = 'avatars'
  and auth.uid ()::text = (storage.foldername (name)) [1]
);
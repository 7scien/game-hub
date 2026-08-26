create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table public.party_board_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  code varchar(6) not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby','active','saved','finished')),
  phase text not null default 'character_select',
  global_turn smallint not null default 0 check (global_turn between 0 and 60),
  state_version bigint not null default 0 check (state_version >= 0),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  saved_at timestamptz
);

create table public.party_board_room_players (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.party_board_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  display_name varchar(16) not null check (char_length(display_name) between 2 and 16),
  character text check (character in ('ghost','mole','chick','slime')),
  is_ready boolean not null default false,
  joined_at timestamptz not null default timezone('utc',now()),
  last_seen_at timestamptz not null default timezone('utc',now()),
  unique (room_id,user_id),
  unique (room_id,seat)
);

create unique index party_board_unique_character_per_room
  on public.party_board_room_players(room_id,character)
  where character is not null;

create index party_board_players_user_idx on public.party_board_room_players(user_id,room_id);

create table public.party_board_action_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.party_board_rooms(id) on delete cascade,
  action_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  expected_version bigint not null,
  result_version bigint,
  action_kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  unique (room_id,action_id)
);

create index party_board_actions_room_idx on public.party_board_action_log(room_id,id desc);

create or replace function private.party_board_is_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.party_board_room_players as player
    where player.room_id = p_room_id
      and player.user_id = (select auth.uid())
  );
$$;

alter table public.party_board_rooms enable row level security;
alter table public.party_board_room_players enable row level security;
alter table public.party_board_action_log enable row level security;

create policy party_board_rooms_member_read
on public.party_board_rooms for select
to authenticated
using ((select private.party_board_is_member(id)));

create policy party_board_players_member_read
on public.party_board_room_players for select
to authenticated
using ((select private.party_board_is_member(room_id)));

create policy party_board_actions_member_read
on public.party_board_action_log for select
to authenticated
using ((select private.party_board_is_member(room_id)));

revoke all on public.party_board_rooms from anon,authenticated;
revoke all on public.party_board_room_players from anon,authenticated;
revoke all on public.party_board_action_log from anon,authenticated;
grant select on public.party_board_rooms to authenticated;
grant select on public.party_board_room_players to authenticated;
grant select on public.party_board_action_log to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.party_board_is_member(uuid) to authenticated;

create or replace function private.party_board_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc',now());
  return new;
end;
$$;

create trigger party_board_rooms_updated_at
before update on public.party_board_rooms
for each row execute function private.party_board_touch_updated_at();

create or replace function private.party_board_build_board()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_used integer[] := '{}'::integer[];
  v_shops integer[] := '{}'::integer[];
  v_special integer[] := '{}'::integer[];
  v_events integer[] := '{}'::integer[];
  v_traps integer[] := '{}'::integer[];
  v_positions integer[];
  v_kind_names text[] := array['special','event','trap'];
  v_target_counts integer[] := array[7,6,5];
  v_kind_index integer;
  v_target integer;
  v_candidate integer;
  v_existing integer;
  v_attempt integer;
  v_restart integer;
  v_valid boolean;
  v_success boolean;
  v_shop_offset integer;
  v_split_offset integer;
  v_split_index integer;
  v_merge_index integer;
  v_branch_length integer;
  v_spaces jsonb := '[]'::jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_nodes jsonb;
  v_kind text;
  i integer;
  b integer;
begin
  v_shop_offset := floor(random()*20)::integer;
  v_shops := array[v_shop_offset,v_shop_offset+20,v_shop_offset+40];
  v_used := v_shops;

  for v_kind_index in 1..3 loop
    v_target := v_target_counts[v_kind_index];
    v_success := false;
    for v_restart in 1..250 loop
      v_positions := '{}'::integer[];
      v_attempt := 0;
      while coalesce(array_length(v_positions,1),0) < v_target and v_attempt < 5000 loop
        v_attempt := v_attempt+1;
        v_candidate := floor(random()*60)::integer;
        v_valid := not (v_candidate = any(v_used));
        if v_valid then
          foreach v_existing in array v_positions loop
            if least(abs(v_candidate-v_existing),60-abs(v_candidate-v_existing)) < 7 then
              v_valid := false;
              exit;
            end if;
          end loop;
        end if;
        if v_valid then v_positions := array_append(v_positions,v_candidate); end if;
      end loop;
      if coalesce(array_length(v_positions,1),0) = v_target then
        v_success := true;
        exit;
      end if;
    end loop;
    if not v_success then raise exception 'BOARD_GENERATION_FAILED'; end if;
    v_used := v_used || v_positions;
    if v_kind_index=1 then v_special := v_positions;
    elsif v_kind_index=2 then v_events := v_positions;
    else v_traps := v_positions;
    end if;
  end loop;

  for i in 0..59 loop
    if i = any(v_shops) then v_kind := 'shop';
    elsif i = any(v_special) then v_kind := 'special';
    elsif i = any(v_events) then v_kind := 'event';
    elsif i = any(v_traps) then v_kind := 'trap';
    else v_kind := 'normal';
    end if;
    v_spaces := v_spaces || jsonb_build_array(jsonb_build_object('id','r'||i,'index',i,'kind',v_kind));
  end loop;

  v_split_offset := floor(random()*15)::integer;
  for b in 0..3 loop
    v_split_index := (v_split_offset+b*15)%60;
    v_merge_index := (v_split_index+5+floor(random()*6)::integer)%60;
    v_branch_length := 15+floor(random()*6)::integer;
    v_nodes := '[]'::jsonb;
    for i in 1..v_branch_length loop
      v_nodes := v_nodes || jsonb_build_array(jsonb_build_object('id','b'||(b+1)||'-'||i,'index',i-1,'kind','branch'));
    end loop;
    v_branches := v_branches || jsonb_build_array(jsonb_build_object(
      'id','branch-'||(b+1),
      'splitId','r'||v_split_index,
      'mergeId','r'||v_merge_index,
      'nodes',v_nodes
    ));
  end loop;

  return jsonb_build_object(
    'seed',encode(extensions.gen_random_bytes(12),'hex'),
    'startId','r0',
    'spaces',v_spaces,
    'branches',v_branches
  );
end;
$$;

create or replace function private.party_board_snapshot(p_room_id uuid,p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room',to_jsonb(room_row),
    'players',coalesce((
      select jsonb_agg(to_jsonb(player_row) order by player_row.seat)
      from public.party_board_room_players as player_row
      where player_row.room_id = room_row.id
    ),'[]'::jsonb),
    'current_user_id',p_user_id
  )
  from public.party_board_rooms as room_row
  where room_row.id = p_room_id;
$$;

create or replace function public.party_board_create_room(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_name text;
  v_created boolean := false;
  i integer;
  attempt integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'),16);
  if char_length(v_name)<2 then raise exception 'INVALID_DISPLAY_NAME'; end if;
  for attempt in 1..60 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars,1+floor(random()*char_length(v_chars))::integer,1);
    end loop;
    v_room_id := extensions.gen_random_uuid();
    begin
      insert into public.party_board_rooms(id,code,host_user_id) values(v_room_id,v_code,v_user_id);
      v_created := true;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  if not v_created then raise exception 'ROOM_CODE_EXHAUSTED'; end if;
  insert into public.party_board_room_players(room_id,user_id,seat,display_name)
  values(v_room_id,v_user_id,0,v_name);
  return private.party_board_snapshot(v_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_join_room(p_code text,p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_name text;
  v_seat integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'),16);
  if char_length(v_name)<2 then raise exception 'INVALID_DISPLAY_NAME'; end if;
  select * into v_room from public.party_board_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists(select 1 from public.party_board_room_players where room_id=v_room.id and user_id=v_user_id) then
    update public.party_board_room_players set display_name=v_name,last_seen_at=timezone('utc',now()) where room_id=v_room.id and user_id=v_user_id;
    return private.party_board_snapshot(v_room.id,v_user_id);
  end if;
  if v_room.status<>'lobby' then raise exception 'ROOM_NOT_JOINABLE'; end if;
  if (select count(*) from public.party_board_room_players where room_id=v_room.id)>=4 then raise exception 'ROOM_FULL'; end if;
  select candidate.seat into v_seat
  from generate_series(0,3) as candidate(seat)
  where not exists(select 1 from public.party_board_room_players as player where player.room_id=v_room.id and player.seat=candidate.seat)
  order by candidate.seat limit 1;
  insert into public.party_board_room_players(room_id,user_id,seat,display_name) values(v_room.id,v_user_id,v_seat,v_name);
  return private.party_board_snapshot(v_room.id,v_user_id);
end;
$$;

create or replace function public.party_board_resume_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select room.id into v_room_id
  from public.party_board_rooms as room
  join public.party_board_room_players as player on player.room_id=room.id
  where room.code=upper(trim(p_code)) and player.user_id=v_user_id;
  if v_room_id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  update public.party_board_room_players set last_seen_at=timezone('utc',now()) where room_id=v_room_id and user_id=v_user_id;
  return private.party_board_snapshot(v_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_get_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists(select 1 from public.party_board_room_players where room_id=p_room_id and user_id=v_user_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_touch_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  update public.party_board_room_players set last_seen_at=timezone('utc',now()) where room_id=p_room_id and user_id=v_user_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_choose_character(p_room_id uuid,p_character text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if p_character not in ('ghost','mole','chick','slime') then raise exception 'INVALID_CHARACTER'; end if;
  select status into v_status from public.party_board_rooms where id=p_room_id for update;
  if v_status is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_status<>'lobby' then raise exception 'ROOM_NOT_JOINABLE'; end if;
  if exists(select 1 from public.party_board_room_players where room_id=p_room_id and character=p_character and user_id<>v_user_id) then raise exception 'CHARACTER_TAKEN'; end if;
  update public.party_board_room_players set character=p_character,is_ready=true,last_seen_at=timezone('utc',now()) where room_id=p_room_id and user_id=v_user_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_set_ready(p_room_id uuid,p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  update public.party_board_room_players set is_ready=p_ready,last_seen_at=timezone('utc',now()) where room_id=p_room_id and user_id=v_user_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_start_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_player_count integer;
  v_character_count integer;
  v_turn_order jsonb;
  v_players jsonb;
  v_board jsonb;
  v_state jsonb;
begin
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_user_id<>v_user_id then raise exception 'HOST_ONLY'; end if;
  select count(*),count(character) into v_player_count,v_character_count from public.party_board_room_players where room_id=p_room_id;
  if v_player_count<>4 then raise exception 'FOUR_PLAYERS_REQUIRED'; end if;
  if v_character_count<>4 then raise exception 'CHARACTERS_REQUIRED'; end if;
  if v_room.status='saved' then
    update public.party_board_rooms set status='active',saved_at=null where id=p_room_id;
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  if v_room.status<>'lobby' then raise exception 'ROOM_NOT_JOINABLE'; end if;
  select jsonb_agg(to_jsonb(player.user_id) order by random()) into v_turn_order from public.party_board_room_players as player where player.room_id=p_room_id;
  select jsonb_object_agg(player.user_id::text,jsonb_build_object(
    'userId',player.user_id,
    'seat',player.seat,
    'displayName',player.display_name,
    'character',player.character,
    'coins',20,
    'stars',0,
    'inventory','[]'::jsonb,
    'positionId','r0',
    'completedLaps',0,
    'totalMoved',0,
    'minigameWins',0,
    'itemsUsed',0
  )) into v_players from public.party_board_room_players as player where player.room_id=p_room_id;
  v_board := private.party_board_build_board();
  v_state := jsonb_build_object(
    'schemaVersion',1,
    'phase','awaiting_roll',
    'globalTurn',1,
    'turnOrder',v_turn_order,
    'currentPlayerId',v_turn_order->>0,
    'players',v_players,
    'board',v_board,
    'starSpaceId',null,
    'pendingMove',null,
    'minigame',null,
    'lastAction',jsonb_build_object('kind','game_started','at',timezone('utc',now()))
  );
  update public.party_board_rooms
  set status='active',phase='awaiting_roll',global_turn=1,state_version=1,game_state=v_state
  where id=p_room_id;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_save_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_host_id uuid;
begin
  select host_user_id into v_host_id from public.party_board_rooms where id=p_room_id for update;
  if v_host_id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_host_id<>v_user_id then raise exception 'HOST_ONLY'; end if;
  update public.party_board_rooms set status='saved',saved_at=timezone('utc',now()) where id=p_room_id;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

revoke execute on function private.party_board_build_board() from public,anon,authenticated;
revoke execute on function private.party_board_snapshot(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.party_board_create_room(text) from public,anon;
revoke execute on function public.party_board_join_room(text,text) from public,anon;
revoke execute on function public.party_board_resume_room(text) from public,anon;
revoke execute on function public.party_board_get_room(uuid) from public,anon;
revoke execute on function public.party_board_touch_room(uuid) from public,anon;
revoke execute on function public.party_board_choose_character(uuid,text) from public,anon;
revoke execute on function public.party_board_set_ready(uuid,boolean) from public,anon;
revoke execute on function public.party_board_start_room(uuid) from public,anon;
revoke execute on function public.party_board_save_room(uuid) from public,anon;

grant execute on function public.party_board_create_room(text) to authenticated;
grant execute on function public.party_board_join_room(text,text) to authenticated;
grant execute on function public.party_board_resume_room(text) to authenticated;
grant execute on function public.party_board_get_room(uuid) to authenticated;
grant execute on function public.party_board_touch_room(uuid) to authenticated;
grant execute on function public.party_board_choose_character(uuid,text) to authenticated;
grant execute on function public.party_board_set_ready(uuid,boolean) to authenticated;
grant execute on function public.party_board_start_room(uuid) to authenticated;
grant execute on function public.party_board_save_room(uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='party_board_rooms') then
    alter publication supabase_realtime add table public.party_board_rooms;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='party_board_room_players') then
    alter publication supabase_realtime add table public.party_board_room_players;
  end if;
end;
$$;

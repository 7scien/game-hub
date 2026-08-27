begin;

create table if not exists public.party_board_minigame_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.party_board_rooms(id) on delete cascade,
  minigame_instance_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  sequence_no integer not null check (sequence_no between 1 and 120),
  created_at timestamptz not null default timezone('utc',now()),
  unique (room_id,minigame_instance_id,user_id,sequence_no),
  unique (room_id,event_id)
);

create index if not exists party_board_minigame_events_score_idx
  on public.party_board_minigame_events(room_id,minigame_instance_id,user_id);

alter table public.party_board_minigame_events enable row level security;

drop policy if exists party_board_minigame_events_member_read on public.party_board_minigame_events;
create policy party_board_minigame_events_member_read
on public.party_board_minigame_events for select
to authenticated
using ((select private.party_board_is_member(room_id)));

revoke all on public.party_board_minigame_events from anon,authenticated;
grant select on public.party_board_minigame_events to authenticated;

create or replace function private.party_board_live_minigame_scores(p_room_id uuid,p_instance_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(player.user_id::text,to_jsonb(coalesce(score.total,0)) order by player.seat),'{}'::jsonb)
  from public.party_board_room_players as player
  left join (
    select event.user_id,count(*)::integer as total
    from public.party_board_minigame_events as event
    where event.room_id=p_room_id and event.minigame_instance_id=p_instance_id
    group by event.user_id
  ) as score on score.user_id=player.user_id
  where player.room_id=p_room_id;
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
      where player_row.room_id=room_row.id
    ),'[]'::jsonb),
    'current_user_id',p_user_id,
    'server_now',now(),
    'minigame_scores',case
      when nullif(room_row.game_state->'minigame'->>'instanceId','') is null then '{}'::jsonb
      else private.party_board_live_minigame_scores(
        room_row.id,
        (room_row.game_state->'minigame'->>'instanceId')::uuid
      )
    end
  )
  from public.party_board_rooms as room_row
  where room_row.id=p_room_id;
$$;

create or replace function public.party_board_finish_turn(
  p_room_id uuid,
  p_action_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_state jsonb;
  v_order jsonb;
  v_ready jsonb;
  v_participants jsonb;
  v_teams jsonb;
  v_instance_id uuid;
  v_current_index integer;
  v_next_index integer;
  v_next_player text;
  v_next_turn integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found or not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists(select 1 from public.party_board_action_log where room_id=p_room_id and action_id=p_action_id) then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  if v_room.status<>'active' then raise exception 'ROOM_NOT_ACTIVE'; end if;
  if v_room.state_version<>p_expected_version then raise exception 'STATE_VERSION_CONFLICT'; end if;
  v_state := v_room.game_state;
  if coalesce(v_state->>'phase','')<>'awaiting_roll' then raise exception 'INVALID_GAME_PHASE'; end if;
  if coalesce(v_state->>'currentPlayerId','')<>v_user_id::text then raise exception 'CURRENT_PLAYER_ONLY'; end if;

  if v_room.global_turn<60 and v_room.global_turn%6=0 then
    v_instance_id := extensions.gen_random_uuid();
    select
      jsonb_object_agg(player.user_id::text,'false'::jsonb order by player.seat),
      jsonb_agg(to_jsonb(player.user_id) order by player.seat),
      jsonb_object_agg(player.user_id::text,to_jsonb('solo-'||(player.seat+1)) order by player.seat)
    into v_ready,v_participants,v_teams
    from public.party_board_room_players as player
    where player.room_id=p_room_id;

    if jsonb_array_length(v_participants)<>4 then raise exception 'FOUR_PLAYERS_REQUIRED'; end if;
    v_state := jsonb_set(v_state,'{phase}','"minigame_briefing"'::jsonb,true);
    v_state := jsonb_set(v_state,'{minigame}',jsonb_build_object(
      'instanceId',v_instance_id,
      'gameId','starlight-catch',
      'type','free_for_all',
      'participants',v_participants,
      'teams',v_teams,
      'phase','BRIEFING',
      'ready',v_ready,
      'resultAcks',v_ready,
      'durationMs',12000,
      'createdAt',v_now,
      'startAt',null,
      'endsAt',null,
      'finalizeAt',null,
      'scores','{}'::jsonb,
      'rankedIds','[]'::jsonb,
      'winnerIds','[]'::jsonb,
      'rewards','{}'::jsonb,
      'coinsBefore','{}'::jsonb,
      'coinsAfter','{}'::jsonb,
      'rewardApplied',false,
      'rewardActionId',null
    ),true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','minigame_created','at',v_now,'actionId',p_action_id),true);
    update public.party_board_rooms
    set phase='minigame_briefing',game_state=v_state,state_version=state_version+1
    where id=p_room_id;
  elsif v_room.global_turn=60 then
    v_state := jsonb_set(v_state,'{phase}','"final_results"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','game_finished','at',v_now,'actionId',p_action_id),true);
    update public.party_board_rooms
    set status='finished',phase='final_results',game_state=v_state,state_version=state_version+1
    where id=p_room_id;
  else
    v_order := v_state->'turnOrder';
    select ordinality-1 into v_current_index
    from jsonb_array_elements_text(v_order) with ordinality as turn_player(user_id,ordinality)
    where user_id=v_user_id::text;
    if v_current_index is null then raise exception 'INVALID_TURN_ORDER'; end if;
    v_next_index := (v_current_index+1)%jsonb_array_length(v_order);
    v_next_player := v_order->>v_next_index;
    v_next_turn := v_room.global_turn+1;
    v_state := jsonb_set(v_state,'{globalTurn}',to_jsonb(v_next_turn),true);
    v_state := jsonb_set(v_state,'{currentPlayerId}',to_jsonb(v_next_player),true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','turn_finished','at',v_now,'actionId',p_action_id),true);
    update public.party_board_rooms
    set global_turn=v_next_turn,phase='awaiting_roll',game_state=v_state,state_version=state_version+1
    where id=p_room_id;
  end if;

  insert into public.party_board_action_log(room_id,action_id,actor_user_id,expected_version,result_version,action_kind,payload)
  values(p_room_id,p_action_id,v_user_id,p_expected_version,p_expected_version+1,'finish_turn',jsonb_build_object('globalTurn',v_room.global_turn));
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_minigame_ready(
  p_room_id uuid,
  p_instance_id uuid,
  p_ready boolean,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_state jsonb;
  v_minigame jsonb;
  v_ready jsonb;
  v_all_ready boolean;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found or not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists(select 1 from public.party_board_action_log where room_id=p_room_id and action_id=p_action_id) then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  v_state := v_room.game_state;
  v_minigame := v_state->'minigame';
  if coalesce(v_minigame->>'instanceId','')<>p_instance_id::text then raise exception 'MINIGAME_NOT_FOUND'; end if;
  if coalesce(v_minigame->>'phase','')<>'BRIEFING' then raise exception 'MINIGAME_ALREADY_STARTED'; end if;
  if not (v_minigame->'participants' ? v_user_id::text) then raise exception 'MINIGAME_NOT_PARTICIPANT'; end if;

  v_ready := jsonb_set(v_minigame->'ready',array[v_user_id::text],to_jsonb(p_ready),true);
  select not exists(select 1 from jsonb_each(v_ready) as entry where entry.value<>'true'::jsonb) into v_all_ready;
  v_minigame := jsonb_set(v_minigame,'{ready}',v_ready,true);
  if v_all_ready then
    v_start_at := v_now+interval '4 seconds';
    v_end_at := v_start_at+interval '12 seconds';
    v_minigame := jsonb_set(v_minigame,'{phase}','"COUNTDOWN"'::jsonb,true);
    v_minigame := jsonb_set(v_minigame,'{startAt}',to_jsonb(v_start_at),true);
    v_minigame := jsonb_set(v_minigame,'{endsAt}',to_jsonb(v_end_at),true);
    v_minigame := jsonb_set(v_minigame,'{finalizeAt}',to_jsonb(v_end_at+interval '1.5 seconds'),true);
    v_state := jsonb_set(v_state,'{phase}','"minigame_countdown"'::jsonb,true);
    v_room.phase := 'minigame_countdown';
  else
    v_room.phase := 'minigame_briefing';
  end if;
  v_state := jsonb_set(v_state,'{minigame}',v_minigame,true);
  v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','minigame_ready','at',v_now,'actor',v_user_id,'ready',p_ready),true);
  update public.party_board_rooms set phase=v_room.phase,game_state=v_state,state_version=state_version+1 where id=p_room_id;
  insert into public.party_board_action_log(room_id,action_id,actor_user_id,expected_version,result_version,action_kind,payload)
  values(p_room_id,p_action_id,v_user_id,v_room.state_version,v_room.state_version+1,'minigame_ready',jsonb_build_object('instanceId',p_instance_id,'ready',p_ready));
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_record_minigame_hit(
  p_room_id uuid,
  p_instance_id uuid,
  p_event_id uuid,
  p_sequence_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_minigame jsonb;
  v_now timestamptz := now();
  v_score integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  select room.game_state->'minigame' into v_minigame from public.party_board_rooms as room where room.id=p_room_id;
  if coalesce(v_minigame->>'instanceId','')<>p_instance_id::text then raise exception 'MINIGAME_NOT_FOUND'; end if;
  if not (v_minigame->'participants' ? v_user_id::text) then raise exception 'MINIGAME_NOT_PARTICIPANT'; end if;
  if coalesce(v_minigame->>'phase','') not in ('COUNTDOWN','PLAYING') then raise exception 'MINIGAME_NOT_PLAYING'; end if;
  if v_now<(v_minigame->>'startAt')::timestamptz or v_now>(v_minigame->>'finalizeAt')::timestamptz then raise exception 'MINIGAME_INPUT_CLOSED'; end if;
  if p_sequence_no<1 or p_sequence_no>120 then raise exception 'INVALID_MINIGAME_SEQUENCE'; end if;

  if exists(select 1 from public.party_board_minigame_events where room_id=p_room_id and event_id=p_event_id) then
    select count(*)::integer into v_score from public.party_board_minigame_events
    where room_id=p_room_id and minigame_instance_id=p_instance_id and user_id=v_user_id;
    return jsonb_build_object('accepted',true,'score',v_score,'serverNow',v_now,'duplicate',true);
  end if;
  select count(*)::integer into v_score from public.party_board_minigame_events
  where room_id=p_room_id and minigame_instance_id=p_instance_id and user_id=v_user_id;
  if p_sequence_no<>v_score+1 then raise exception 'MINIGAME_SEQUENCE_CONFLICT'; end if;
  insert into public.party_board_minigame_events(room_id,minigame_instance_id,user_id,event_id,sequence_no)
  values(p_room_id,p_instance_id,v_user_id,p_event_id,p_sequence_no);
  return jsonb_build_object('accepted',true,'score',v_score+1,'serverNow',v_now,'duplicate',false);
end;
$$;

create or replace function public.party_board_finalize_minigame(
  p_room_id uuid,
  p_instance_id uuid,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_state jsonb;
  v_minigame jsonb;
  v_scores jsonb;
  v_ranked jsonb;
  v_winner text;
  v_rewards jsonb;
  v_reward_pool constant integer := 40;
  v_coins_before jsonb := '{}'::jsonb;
  v_coins_after jsonb := '{}'::jsonb;
  v_result_acks jsonb;
  v_player record;
  v_before integer;
  v_reward integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found or not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists(select 1 from public.party_board_action_log where room_id=p_room_id and action_id=p_action_id) then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  v_state := v_room.game_state;
  v_minigame := v_state->'minigame';
  if coalesce(v_minigame->>'instanceId','')<>p_instance_id::text then raise exception 'MINIGAME_NOT_FOUND'; end if;
  if coalesce(v_minigame->>'phase','') in ('MINIGAME_RESULT','REWARD_APPLIED','RETURNING_TO_BOARD') then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  if v_now<(v_minigame->>'finalizeAt')::timestamptz then raise exception 'MINIGAME_STILL_RUNNING'; end if;

  select
    jsonb_object_agg(player.user_id::text,to_jsonb(coalesce(score.total,0)) order by player.seat),
    jsonb_agg(to_jsonb(player.user_id) order by coalesce(score.total,0) desc,player.seat)
  into v_scores,v_ranked
  from public.party_board_room_players as player
  left join (
    select event.user_id,count(*)::integer as total
    from public.party_board_minigame_events as event
    where event.room_id=p_room_id and event.minigame_instance_id=p_instance_id
    group by event.user_id
  ) as score on score.user_id=player.user_id
  where player.room_id=p_room_id;
  v_winner := v_ranked->>0;
  v_rewards := jsonb_build_object(v_winner,v_reward_pool);
  select jsonb_object_agg(player.user_id::text,'false'::jsonb order by player.seat)
  into v_result_acks from public.party_board_room_players as player where player.room_id=p_room_id;

  for v_player in select key,value from jsonb_each(v_state->'players') loop
    v_before := coalesce((v_player.value->>'coins')::integer,0);
    v_reward := coalesce((v_rewards->>v_player.key)::integer,0);
    v_coins_before := jsonb_set(v_coins_before,array[v_player.key],to_jsonb(v_before),true);
    v_coins_after := jsonb_set(v_coins_after,array[v_player.key],to_jsonb(v_before+v_reward),true);
  end loop;

  v_minigame := jsonb_set(v_minigame,'{phase}','"MINIGAME_RESULT"'::jsonb,true);
  v_minigame := jsonb_set(v_minigame,'{scores}',v_scores,true);
  v_minigame := jsonb_set(v_minigame,'{rankedIds}',v_ranked,true);
  v_minigame := jsonb_set(v_minigame,'{winnerIds}',jsonb_build_array(v_winner),true);
  v_minigame := jsonb_set(v_minigame,'{rewards}',v_rewards,true);
  v_minigame := jsonb_set(v_minigame,'{coinsBefore}',v_coins_before,true);
  v_minigame := jsonb_set(v_minigame,'{coinsAfter}',v_coins_after,true);
  v_minigame := jsonb_set(v_minigame,'{resultAcks}',v_result_acks,true);
  v_minigame := jsonb_set(v_minigame,'{endedAt}',to_jsonb(v_now),true);
  v_state := jsonb_set(v_state,'{phase}','"minigame_result"'::jsonb,true);
  v_state := jsonb_set(v_state,'{minigame}',v_minigame,true);
  v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','minigame_finalized','at',v_now,'actionId',p_action_id),true);
  update public.party_board_rooms set phase='minigame_result',game_state=v_state,state_version=state_version+1 where id=p_room_id;
  insert into public.party_board_action_log(room_id,action_id,actor_user_id,expected_version,result_version,action_kind,payload)
  values(p_room_id,p_action_id,v_user_id,v_room.state_version,v_room.state_version+1,'minigame_finalize',jsonb_build_object('instanceId',p_instance_id,'winnerId',v_winner));
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_ack_minigame_result(
  p_room_id uuid,
  p_instance_id uuid,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_state jsonb;
  v_minigame jsonb;
  v_acks jsonb;
  v_all_acked boolean;
  v_players jsonb;
  v_player record;
  v_reward integer;
  v_before integer;
  v_wins integer;
  v_is_winner boolean;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found or not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists(select 1 from public.party_board_action_log where room_id=p_room_id and action_id=p_action_id) then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  v_state := v_room.game_state;
  v_minigame := v_state->'minigame';
  if coalesce(v_minigame->>'instanceId','')<>p_instance_id::text then raise exception 'MINIGAME_NOT_FOUND'; end if;
  if coalesce(v_minigame->>'phase','') in ('REWARD_APPLIED','RETURNING_TO_BOARD') then
    return private.party_board_snapshot(p_room_id,v_user_id);
  end if;
  if coalesce(v_minigame->>'phase','')<>'MINIGAME_RESULT' then raise exception 'MINIGAME_RESULT_NOT_READY'; end if;
  if not (v_minigame->'participants' ? v_user_id::text) then raise exception 'MINIGAME_NOT_PARTICIPANT'; end if;

  v_acks := jsonb_set(v_minigame->'resultAcks',array[v_user_id::text],'true'::jsonb,true);
  select not exists(select 1 from jsonb_each(v_acks) as entry where entry.value<>'true'::jsonb) into v_all_acked;
  v_minigame := jsonb_set(v_minigame,'{resultAcks}',v_acks,true);
  if v_all_acked and not coalesce((v_minigame->>'rewardApplied')::boolean,false) then
    v_players := v_state->'players';
    for v_player in select key,value from jsonb_each(v_players) loop
      v_reward := coalesce((v_minigame->'rewards'->>v_player.key)::integer,0);
      v_before := coalesce((v_player.value->>'coins')::integer,0);
      v_wins := coalesce((v_player.value->>'minigameWins')::integer,0);
      v_is_winner := v_minigame->'winnerIds' ? v_player.key;
      v_players := jsonb_set(v_players,array[v_player.key,'coins'],to_jsonb(v_before+v_reward),true);
      v_players := jsonb_set(v_players,array[v_player.key,'minigameWins'],to_jsonb(v_wins+case when v_is_winner then 1 else 0 end),true);
    end loop;
    v_state := jsonb_set(v_state,'{players}',v_players,true);
    v_minigame := jsonb_set(v_minigame,'{phase}','"REWARD_APPLIED"'::jsonb,true);
    v_minigame := jsonb_set(v_minigame,'{rewardApplied}','true'::jsonb,true);
    v_minigame := jsonb_set(v_minigame,'{rewardActionId}',to_jsonb(p_action_id),true);
    v_minigame := jsonb_set(v_minigame,'{rewardAppliedAt}',to_jsonb(v_now),true);
    v_minigame := jsonb_set(v_minigame,'{returnAt}',to_jsonb(v_now+interval '3 seconds'),true);
    v_state := jsonb_set(v_state,'{phase}','"reward_applied"'::jsonb,true);
    v_room.phase := 'reward_applied';
  else
    v_room.phase := 'minigame_result';
  end if;
  v_state := jsonb_set(v_state,'{minigame}',v_minigame,true);
  v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','minigame_result_ack','at',v_now,'actor',v_user_id,'allAcked',v_all_acked),true);
  update public.party_board_rooms set phase=v_room.phase,game_state=v_state,state_version=state_version+1 where id=p_room_id;
  insert into public.party_board_action_log(room_id,action_id,actor_user_id,expected_version,result_version,action_kind,payload)
  values(p_room_id,p_action_id,v_user_id,v_room.state_version,v_room.state_version+1,'minigame_result_ack',jsonb_build_object('instanceId',p_instance_id,'allAcked',v_all_acked));
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

create or replace function public.party_board_sync_minigame(p_room_id uuid,p_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.party_board_rooms%rowtype;
  v_state jsonb;
  v_minigame jsonb;
  v_phase text;
  v_now timestamptz := now();
  v_changed boolean := false;
  v_order jsonb;
  v_current_index integer;
  v_next_index integer;
  v_next_player text;
  v_next_turn integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.party_board_rooms where id=p_room_id for update;
  if not found or not private.party_board_is_member(p_room_id) then raise exception 'ROOM_NOT_FOUND'; end if;
  v_state := v_room.game_state;
  v_minigame := v_state->'minigame';
  if v_minigame is null or v_minigame='null'::jsonb then return private.party_board_snapshot(p_room_id,v_user_id); end if;
  if coalesce(v_minigame->>'instanceId','')<>p_instance_id::text then raise exception 'MINIGAME_NOT_FOUND'; end if;
  v_phase := v_minigame->>'phase';

  if v_phase='COUNTDOWN' and v_now>=(v_minigame->>'startAt')::timestamptz then
    v_minigame := jsonb_set(v_minigame,'{phase}','"PLAYING"'::jsonb,true);
    v_state := jsonb_set(v_state,'{phase}','"minigame_playing"'::jsonb,true);
    v_room.phase := 'minigame_playing';
    v_changed := true;
  elsif v_phase='REWARD_APPLIED' and v_now>=(v_minigame->>'returnAt')::timestamptz then
    v_minigame := jsonb_set(v_minigame,'{phase}','"RETURNING_TO_BOARD"'::jsonb,true);
    v_minigame := jsonb_set(v_minigame,'{boardAt}',to_jsonb(v_now+interval '1.5 seconds'),true);
    v_state := jsonb_set(v_state,'{phase}','"returning_to_board"'::jsonb,true);
    v_room.phase := 'returning_to_board';
    v_changed := true;
  elsif v_phase='RETURNING_TO_BOARD' and v_now>=(v_minigame->>'boardAt')::timestamptz then
    v_order := v_state->'turnOrder';
    select ordinality-1 into v_current_index
    from jsonb_array_elements_text(v_order) with ordinality as turn_player(user_id,ordinality)
    where user_id=coalesce(v_state->>'currentPlayerId','');
    if v_current_index is null then raise exception 'INVALID_TURN_ORDER'; end if;
    v_next_index := (v_current_index+1)%jsonb_array_length(v_order);
    v_next_player := v_order->>v_next_index;
    v_next_turn := least(v_room.global_turn+1,60);
    v_state := jsonb_set(v_state,'{lastMinigame}',v_minigame,true);
    v_state := jsonb_set(v_state,'{minigame}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{phase}','"awaiting_roll"'::jsonb,true);
    v_state := jsonb_set(v_state,'{globalTurn}',to_jsonb(v_next_turn),true);
    v_state := jsonb_set(v_state,'{currentPlayerId}',to_jsonb(v_next_player),true);
    v_room.phase := 'awaiting_roll';
    v_room.global_turn := v_next_turn;
    v_changed := true;
  end if;

  if v_changed then
    if v_state->'minigame' is distinct from 'null'::jsonb then v_state := jsonb_set(v_state,'{minigame}',v_minigame,true); end if;
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('kind','minigame_phase_sync','at',v_now,'phase',v_room.phase),true);
    update public.party_board_rooms
    set phase=v_room.phase,global_turn=v_room.global_turn,game_state=v_state,state_version=state_version+1
    where id=p_room_id;
  end if;
  return private.party_board_snapshot(p_room_id,v_user_id);
end;
$$;

revoke execute on function private.party_board_live_minigame_scores(uuid,uuid) from public,anon,authenticated;
revoke execute on function private.party_board_snapshot(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.party_board_finish_turn(uuid,uuid,bigint) from public,anon;
revoke execute on function public.party_board_minigame_ready(uuid,uuid,boolean,uuid) from public,anon;
revoke execute on function public.party_board_record_minigame_hit(uuid,uuid,uuid,integer) from public,anon;
revoke execute on function public.party_board_finalize_minigame(uuid,uuid,uuid) from public,anon;
revoke execute on function public.party_board_ack_minigame_result(uuid,uuid,uuid) from public,anon;
revoke execute on function public.party_board_sync_minigame(uuid,uuid) from public,anon;

grant execute on function public.party_board_finish_turn(uuid,uuid,bigint) to authenticated;
grant execute on function public.party_board_minigame_ready(uuid,uuid,boolean,uuid) to authenticated;
grant execute on function public.party_board_record_minigame_hit(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.party_board_finalize_minigame(uuid,uuid,uuid) to authenticated;
grant execute on function public.party_board_ack_minigame_result(uuid,uuid,uuid) to authenticated;
grant execute on function public.party_board_sync_minigame(uuid,uuid) to authenticated;

commit;

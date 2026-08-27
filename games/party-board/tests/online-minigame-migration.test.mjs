import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migrationUrl=new URL('../supabase/migrations/202608270003_online_minigame.sql',import.meta.url);
const migration=await readFile(migrationUrl,'utf8');

test('online minigame migration exposes the complete authoritative RPC boundary',()=>{
  for(const name of [
    'party_board_finish_turn','party_board_minigame_ready','party_board_record_minigame_hit',
    'party_board_finalize_minigame','party_board_ack_minigame_result','party_board_sync_minigame',
  ])assert.match(migration,new RegExp(`create or replace function public\\.${name}\\b`));
});

test('reward application and minigame wins are guarded by one stored flag',()=>{
  assert.match(migration,/rewardApplied/);
  assert.match(migration,/rewardActionId/);
  assert.match(migration,/minigameWins/);
  assert.match(migration,/and not coalesce\(\(v_minigame->>'rewardApplied'\)::boolean,false\)/);
  assert.match(migration,/exists\(select 1 from public\.party_board_action_log where room_id=p_room_id and action_id=p_action_id\)/);
});

test('server timestamps and validated score events drive reconnect recovery',()=>{
  for(const field of ['startAt','endsAt','finalizeAt','returnAt','boardAt'])assert.match(migration,new RegExp(`'${field}'`));
  assert.match(migration,/party_board_minigame_events/);
  assert.match(migration,/p_sequence_no<>v_score\+1/);
  assert.match(migration,/MINIGAME_RESULT/);
  assert.match(migration,/REWARD_APPLIED/);
  assert.match(migration,/RETURNING_TO_BOARD/);
});

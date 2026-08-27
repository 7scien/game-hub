import {ensureAnonymousSession,getSupabaseClient} from './supabase.js';

const RESUME_KEY='party-board:last-room-code';
const activeChannels=new Map();

export const roomService={
  getResumeCode(){return localStorage.getItem(RESUME_KEY)||''},
  clearResumeCode(){localStorage.removeItem(RESUME_KEY)},

  async createRoom(displayName){
    await ensureAnonymousSession();
    const snapshot=await rpc('party_board_create_room',{p_display_name:cleanName(displayName)});
    remember(snapshot);
    return snapshot;
  },

  async joinRoom(code,displayName){
    await ensureAnonymousSession();
    const snapshot=await rpc('party_board_join_room',{p_code:cleanCode(code),p_display_name:cleanName(displayName)});
    remember(snapshot);
    return snapshot;
  },

  async resumeRoom(code=this.getResumeCode()){
    if(!code)throw new Error('이어갈 방 정보가 없습니다.');
    await ensureAnonymousSession();
    const snapshot=await rpc('party_board_resume_room',{p_code:cleanCode(code)});
    remember(snapshot);
    return snapshot;
  },

  async refresh(roomId){return rpc('party_board_get_room',{p_room_id:roomId})},
  async chooseCharacter(roomId,character){return rpc('party_board_choose_character',{p_room_id:roomId,p_character:character})},
  async setReady(roomId,isReady){return rpc('party_board_set_ready',{p_room_id:roomId,p_ready:Boolean(isReady)})},
  async startRoom(roomId){return rpc('party_board_start_room',{p_room_id:roomId})},
  async saveRoom(roomId){return rpc('party_board_save_room',{p_room_id:roomId})},
  async finishTurn(roomId,stateVersion,actionId=createActionId()){
    return rpc('party_board_finish_turn',{p_room_id:roomId,p_action_id:actionId,p_expected_version:stateVersion});
  },
  async setMinigameReady(roomId,instanceId,isReady,actionId=createActionId()){
    return rpc('party_board_minigame_ready',{p_room_id:roomId,p_instance_id:instanceId,p_ready:Boolean(isReady),p_action_id:actionId});
  },
  async recordMinigameHit(roomId,instanceId,sequence,eventId=createActionId()){
    return rpc('party_board_record_minigame_hit',{p_room_id:roomId,p_instance_id:instanceId,p_event_id:eventId,p_sequence_no:sequence});
  },
  async finalizeMinigame(roomId,instanceId,actionId=createActionId()){
    return rpc('party_board_finalize_minigame',{p_room_id:roomId,p_instance_id:instanceId,p_action_id:actionId});
  },
  async acknowledgeMinigameResult(roomId,instanceId,actionId=createActionId()){
    return rpc('party_board_ack_minigame_result',{p_room_id:roomId,p_instance_id:instanceId,p_action_id:actionId});
  },
  async syncMinigame(roomId,instanceId){return rpc('party_board_sync_minigame',{p_room_id:roomId,p_instance_id:instanceId})},

  async broadcastMinigameHit(roomId,payload){
    const channel=activeChannels.get(roomId);
    if(!channel)return false;
    const session=await ensureAnonymousSession();
    await channel.send({type:'broadcast',event:'minigame_hit',payload:{...payload,userId:session.user.id}});
    return true;
  },

  async subscribe(snapshot,{onSnapshot,onPresence,onStatus,onMinigameEvent=()=>{}}){
    const session=await ensureAnonymousSession();
    const roomId=snapshot.room.id;
    const supabase=getSupabaseClient();
    let refreshPending=false;
    const refresh=async()=>{
      if(refreshPending)return;
      refreshPending=true;
      try{onSnapshot(await this.refresh(roomId))}finally{refreshPending=false}
    };
    const channel=supabase.channel(`party-board:${roomId}`,{config:{presence:{key:session.user.id}}});
    channel
      .on('postgres_changes',{event:'*',schema:'public',table:'party_board_rooms',filter:`id=eq.${roomId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'party_board_room_players',filter:`room_id=eq.${roomId}`},refresh)
      .on('broadcast',{event:'minigame_hit'},message=>onMinigameEvent(message.payload||{}))
      .on('presence',{event:'sync'},()=>{
        const userIds=new Set();
        for(const presences of Object.values(channel.presenceState())){
          for(const presence of presences)if(presence.user_id)userIds.add(presence.user_id);
        }
        onPresence(userIds);
      });
    channel.subscribe(async status=>{
      onStatus(status);
      if(status==='SUBSCRIBED'){
        await channel.track({user_id:session.user.id,room_id:roomId,online_at:new Date().toISOString()});
        await rpc('party_board_touch_room',{p_room_id:roomId});
      }
    });
    activeChannels.set(roomId,channel);
    return async()=>{if(activeChannels.get(roomId)===channel)activeChannels.delete(roomId);await supabase.removeChannel(channel)};
  },
};

function createActionId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,character=>{
    const value=Math.random()*16|0;return (character==='x'?value:value&3|8).toString(16);
  });
}

async function rpc(name,parameters){
  const {data,error}=await getSupabaseClient().rpc(name,parameters);
  if(error)throw new Error(readableError(error));
  return data;
}

function cleanCode(value){
  const code=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(code.length!==6)throw new Error('방 코드는 영문·숫자 6자리입니다.');
  return code;
}

function cleanName(value){
  const name=String(value||'').trim().replace(/\s+/g,' ').slice(0,16);
  if(name.length<2)throw new Error('닉네임을 2자 이상 입력해주세요.');
  return name;
}

function remember(snapshot){
  if(snapshot?.room?.code)localStorage.setItem(RESUME_KEY,snapshot.room.code);
}

function readableError(error){
  const messages={
    'ROOM_NOT_FOUND':'방 코드를 다시 확인해주세요.',
    'ROOM_FULL':'이미 네 명이 입장한 방입니다.',
    'ROOM_NOT_JOINABLE':'지금은 새 플레이어가 참여할 수 없는 방입니다.',
    'CHARACTER_TAKEN':'다른 플레이어가 먼저 고른 캐릭터입니다.',
    'HOST_ONLY':'방장만 실행할 수 있습니다.',
    'FOUR_PLAYERS_REQUIRED':'네 명이 모두 들어와야 시작할 수 있습니다.',
    'CHARACTERS_REQUIRED':'모든 플레이어가 캐릭터를 골라야 합니다.',
    'CURRENT_PLAYER_ONLY':'현재 차례인 플레이어만 턴을 마칠 수 있습니다.',
    'STATE_VERSION_CONFLICT':'게임 상태가 먼저 변경되었습니다. 최신 상태로 다시 시도해주세요.',
    'INVALID_GAME_PHASE':'지금은 이 동작을 실행할 수 없는 단계입니다.',
    'MINIGAME_ALREADY_STARTED':'미니게임 준비가 이미 끝났습니다.',
    'MINIGAME_NOT_PLAYING':'미니게임 입력을 받을 수 없는 단계입니다.',
    'MINIGAME_INPUT_CLOSED':'미니게임 입력 시간이 종료되었습니다.',
    'MINIGAME_SEQUENCE_CONFLICT':'입력 순서가 맞지 않아 서버 점수로 다시 맞춥니다.',
    'MINIGAME_STILL_RUNNING':'미니게임이 아직 끝나지 않았습니다.',
    'MINIGAME_RESULT_NOT_READY':'미니게임 결과가 아직 확정되지 않았습니다.',
  };
  return messages[error.message]||error.message||'온라인 요청을 처리하지 못했습니다.';
}

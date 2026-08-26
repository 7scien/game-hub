import {ensureAnonymousSession,getSupabaseClient} from './supabase.js';

const RESUME_KEY='party-board:last-room-code';

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

  async subscribe(snapshot,{onSnapshot,onPresence,onStatus}){
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
    return async()=>{await supabase.removeChannel(channel)};
  },
};

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
  };
  return messages[error.message]||error.message||'온라인 요청을 처리하지 못했습니다.';
}

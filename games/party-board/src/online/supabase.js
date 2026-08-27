import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from '../config.js';

let client;

function testProfile(){
  if(!import.meta.env.DEV||typeof location==='undefined')return '';
  return (new URLSearchParams(location.search).get('profile')||'').replace(/[^a-z0-9_-]/gi,'').slice(0,24);
}

export function getSupabaseClient(){
  if(!supabaseConfig.isConfigured)throw new Error('Supabase 연결 정보가 아직 설정되지 않았습니다.');
  const profile=testProfile();
  client??=createClient(supabaseConfig.url,supabaseConfig.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,...(profile?{storageKey:`party-board-auth-${profile}`}:{})},
  });
  return client;
}

export async function ensureAnonymousSession(){
  const supabase=getSupabaseClient();
  const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
  if(sessionError)throw sessionError;
  if(sessionData.session)return sessionData.session;
  const {data,error}=await supabase.auth.signInAnonymously();
  if(error)throw error;
  if(!data.session)throw new Error('익명 플레이어 세션을 만들지 못했습니다.');
  return data.session;
}

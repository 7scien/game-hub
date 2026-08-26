import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from '../config.js';

let client;

export function getSupabaseClient(){
  if(!supabaseConfig.isConfigured)throw new Error('Supabase 연결 정보가 아직 설정되지 않았습니다.');
  client??=createClient(supabaseConfig.url,supabaseConfig.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
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

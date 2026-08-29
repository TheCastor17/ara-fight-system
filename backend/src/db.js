import {createClient} from '@supabase/supabase-js';import {config} from './config.js';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
export const admin=createClient(config.supabaseUrl,config.serviceKey,options);
export const publicClient=createClient(config.supabaseUrl,config.anonKey,options);
export function userClient(token){return createClient(config.supabaseUrl,config.anonKey,{...options,global:{headers:{Authorization:`Bearer ${token}`}}})}

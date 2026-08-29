import {createClient} from '@supabase/supabase-js'; import {config} from './config.js';
export const admin=createClient(config.supabaseUrl,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
export const anon=createClient(config.supabaseUrl,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});

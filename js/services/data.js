import { supabase } from '../config/supabase.js';
import { invalidatePageCache } from './cache.js';
export async function rows(table, options={}) { if (!supabase) throw new Error('Connect Supabase in .env.local to load live data.'); let q=supabase.from(table).select(options.select||'*').order(options.order||'created_at',{ascending:false}); if(options.restaurant_id) q=q.eq('restaurant_id',options.restaurant_id); for(const [k,v] of Object.entries(options.filters||{})) q=q.eq(k,v); if(options.limit) q=q.limit(options.limit); const {data,error}=await q; if(error) throw error; return data||[]; }
export async function insert(table, values) { const {data,error}=await supabase.from(table).insert(values).select().single(); if(error) throw error; invalidatePageCache(); return data; }
export async function update(table,id,values) { const {data,error}=await supabase.from(table).update(values).eq('id',id).select().single(); if(error) throw error; invalidatePageCache(); return data; }
export async function remove(table,id) { const {error}=await supabase.from(table).delete().eq('id',id); if(error) throw error; invalidatePageCache(); }
export async function count(table, filters={}) { let q=supabase.from(table).select('id',{count:'exact',head:true}); for(const [k,v] of Object.entries(filters)) q=q.eq(k,v); const {count,error}=await q; if(error) throw error; return count||0; }

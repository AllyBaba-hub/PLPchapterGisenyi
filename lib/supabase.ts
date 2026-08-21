import {createServerClient} from '@supabase/ssr';import {cookies} from 'next/headers';
export function createSupabaseServerClient(){const store=cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{get:(n)=>store.get(n)?.value,set:(n,v,o)=>store.set({name:n,value:v,...o}),remove:(n,o)=>store.set({name:n,value:'',...o})}})}
export function requireServerEnv(name:string){const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value}

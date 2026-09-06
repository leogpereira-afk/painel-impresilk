// Supervisor independente: consulta o frescor e solicita a carga existente.
// Não escreve nem remove registros de ordens, títulos ou cadastros.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {vigiarCache} from "../_shared/vigia-cache.ts";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const TOKEN=Deno.env.get("PAINEL_TOKEN") || "";
const resposta=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return resposta({erro:"Use POST."},405);
 if(!TOKEN || req.headers.get("x-token")!==TOKEN)return resposta({erro:"Não autorizado."},401);
 try {return resposta(await vigiarCache(sb));}
 catch(e) {return resposta({ok:false,erro:(e as Error).message},503);}
});

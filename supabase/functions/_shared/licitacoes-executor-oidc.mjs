// Identidade temporária do executor público. Não concede ERP, memória, chat
// ou acesso geral ao bot. O token de leitura do painel continua só leitura.
const ISSUER='https://token.actions.githubusercontent.com';
const REPO='leogpereira-afk/painel-impresilk';
const REPO_ID='1299857010',OWNER_ID='295585568';
const WORKFLOW=REPO+'/.github/workflows/pesquisa-licitacoes.yml@refs/heads/main';
const AUD='impresilk-licitacoes';
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const decode=s=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(s)));
export async function verificarExecutorLicitacoes(req,{fetcher=fetch,agora=()=>Date.now()}={}){
  try{
    const token=req.headers.get('x-impresilk-executor-oidc');
    if(!token||token.length>16384)return false;
    const partes=token.split('.');if(partes.length!==3||partes.some(x=>!x||!/^[A-Za-z0-9_-]+$/.test(x)))return false;
    const h=decode(partes[0]),c=decode(partes[1]),now=Math.floor(agora()/1000);
    if(h.alg!=='RS256'||h.typ!=='JWT'||typeof h.kid!=='string'||h.kid.length>200)return false;
    if(c.iss!==ISSUER||c.aud!==AUD||c.repository!==REPO||c.repository_id!==REPO_ID||c.repository_owner_id!==OWNER_ID||c.ref!=='refs/heads/main'||c.event_name!=='workflow_dispatch'||c.workflow_ref!==WORKFLOW||!/^[0-9]+$/.test(c.run_id))return false;
    const sujeitos=[`repo:${REPO}:ref:refs/heads/main`,`repo:leogpereira-afk@${OWNER_ID}/painel-impresilk@${REPO_ID}:ref:refs/heads/main`];
    if(!sujeitos.includes(c.sub))return false;
    if(![c.exp,c.iat,c.nbf].every(Number.isSafeInteger)||c.exp<=now||c.iat>now+30||c.nbf>now+30||now-c.iat>600||c.exp-c.iat>600)return false;
    const response=await fetcher(ISSUER+'/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok||response.redirected)return false;
    const text=await response.text();if(new TextEncoder().encode(text).byteLength>128000)return false;
    const keys=JSON.parse(text).keys;if(!Array.isArray(keys)||keys.length>30)return false;
    const jwk=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
    if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(partes[2]),new TextEncoder().encode(partes[0]+'.'+partes[1]));
  }catch{return false;}
}

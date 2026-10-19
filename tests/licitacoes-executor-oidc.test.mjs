import test from 'node:test';
import assert from 'node:assert/strict';
import {verificarExecutorLicitacoes} from '../supabase/functions/_shared/licitacoes-executor-oidc.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'teste',alg:'RS256',use:'sig'};
const now=Date.now();
const baseline={iss:'https://token.actions.githubusercontent.com',aud:'impresilk-licitacoes',repository:'leogpereira-afk/painel-impresilk',repository_id:'1299857010',repository_owner_id:'295585568',ref:'refs/heads/main',event_name:'workflow_dispatch',workflow_ref:'leogpereira-afk/painel-impresilk/.github/workflows/pesquisa-licitacoes.yml@refs/heads/main',run_id:'123',iat:Math.floor(now/1000),nbf:Math.floor(now/1000),exp:Math.floor(now/1000)+300,sub:'repo:leogpereira-afk/painel-impresilk:ref:refs/heads/main'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function request(claims={},mutate=false){let h=encode({alg:'RS256',kid:'teste',typ:'JWT'}),b=encode({...baseline,...claims});let sign=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+b))).toString('base64url');if(mutate)sign=(sign[0]==='a'?'b':'a')+sign.slice(1);return new Request('https://example.invalid',{headers:{'x-impresilk-executor-oidc':h+'.'+b+'.'+sign}});}
const deps={agora:()=>now,fetcher:async url=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]});}};
test('aceita somente identidade assinada do workflow público autorizado',async()=>assert.equal(await verificarExecutorLicitacoes(await request(),deps),true));
for(const claims of [{repository:'evil/fork'},{repository_id:'999'},{repository_owner_id:'999'},{ref:'refs/heads/outra'},{workflow_ref:'leogpereira-afk/painel-impresilk/.github/workflows/evil.yml@refs/heads/main'},{event_name:'pull_request'},{aud:'outro'},{exp:Math.floor(now/1000)-1},{iat:Math.floor(now/1000)+120},{sub:'repo:evil/fork:ref:refs/heads/main'}])test('recusa claims fora da confiança '+JSON.stringify(claims),async()=>assert.equal(await verificarExecutorLicitacoes(await request(claims),deps),false));
test('recusa assinatura adulterada',async()=>assert.equal(await verificarExecutorLicitacoes(await request({},true),deps),false));
test('recusa ausência e não consulta chave externa',async()=>assert.equal(await verificarExecutorLicitacoes(new Request('https://example.invalid'),{fetcher:()=>{throw Error('Não deveria chamar');}}),false));

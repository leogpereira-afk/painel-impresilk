import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkConsultoria,tokenConsultoria} from './consultoria-link.js';
const token='processo-exemplo.'+'f'.repeat(64);
for(const c of [{base:'/painel-impresilk/',pathname:'/painel-impresilk/consultorias',review:false},{base:'/',pathname:'/consultorias',review:true},{base:'/dist-review/',pathname:'/dist-review/revisao-local.html',review:true}])test('link abre o convite no roteador correto: '+c.pathname,()=>{
 const u=new URL(linkConsultoria(token,{origin:'https://example.invalid',...c}));
 assert.equal(u.search,'');assert.equal(tokenConsultoria(u.hash,c.review),token);
 assert.equal(u.pathname,c.pathname.endsWith('revisao-local.html')?'/dist-review/revisao-local.html':c.base+'colaborar');
});
test('produção não aceita rota de teste nem token da query da página',()=>{
 assert.equal(tokenConsultoria('#/colaborar?convite='+token,false),'');
 assert.equal(tokenConsultoria('?convite='+token,true),'');
});

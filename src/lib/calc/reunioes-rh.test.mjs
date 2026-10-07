import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararReuniao,carimbarReuniao,pessoasParaReunioes,agendaReunioes} from '../../../supabase/functions/_shared/reunioes.mjs';
import {gerarPdfPresenca,participantesPdf} from '../pdfPresenca.js';
const sessao={sub:'ana',nome:'Ana'},base=()=>({id:'r1',titulo:'Planejamento',setor:'financeiro',tipo:'reuniao',situacao:'agendado',data:'2026-10-07',inicio:'09:00',fim:'10:00',responsavel:'Ana',participantes:[],decisoes:[]});
const pessoa={id:'rh1',nome:'João Gonçalves',areaId:'fin',area:'Financeiro',cargo:'Analista'};
test('RH projeta somente identificação profissional e respeita status e desligamento',()=>{
 const p={id:'rh1',nome:'João',areaId:'fin',cargoId:'c1',statusId:'ok',cpf:'sigilo',salario:9000,diagnostico:'sigilo'};
 const r=pessoasParaReunioes([p,{...p,id:'rh2',dataDesligamento:'2026-01-01'},{...p,id:'rh3',statusId:'desconhecido'},{...p,id:'rh4',statusId:'direcao'}],[{id:'ok',contaComoAtivo:'true'}],[{id:'fin',nome:'Financeiro'}],[{id:'c1',nome:'Analista'}]);
 assert.deepEqual(r.map(x=>x.id),['rh1','rh4']);assert.deepEqual(Object.keys(r[0]).sort(),['id','nome','areaId','area','cargo'].sort());assert.ok(!JSON.stringify(r).includes('sigilo'));assert.equal(r[0].area,'Financeiro');
});
test('RH usa o ID confirmado pelo servidor, distingue homônimos e rejeita vínculo forjado ou duplicado',()=>{
 const participante={id:'p1',rhId:'rh1',nome:'Forjado',area:'Forjada',presenca:'pendente'};
 const make=ps=>prepararReuniao({...base(),participantes:ps},null,sessao,undefined,[pessoa,{...pessoa,id:'rh2'}]);
 assert.equal(make([participante]).participantes[0].nome,pessoa.nome);
 assert.equal(make([participante,{...participante,id:'p2',rhId:'rh2'}]).participantes.length,2);
 assert.throws(()=>make([participante,{...participante,id:'p2'}]),/duas vezes/);
 assert.throws(()=>make([{...participante,rhId:'nao-existe'}]),/não disponível/);
});
test('reuniões antigas mantêm identificação histórica e permitem editar convidados externos',()=>{
 const r=carimbarReuniao(prepararReuniao({...base(),participantes:[{id:'p1',rhId:'rh1',nome:'irrelevante',presenca:'presente'},{id:'p2',nome:'Externo',presenca:'pendente'}]},null,sessao,undefined,[pessoa]),sessao,'Criou');
 const n=prepararReuniao({...r,versaoAnterior:r.versao,participantes:r.participantes.map(p=>({...p,nome:'Nome alterado'}))},r,sessao,undefined,[]);
 assert.equal(n.participantes[0].nome,pessoa.nome);assert.equal(n.participantes[0].rhId,'rh1');assert.equal(n.participantes[1].nome,'Nome alterado');
 assert.equal(prepararReuniao({...base(),setor:undefined},null,sessao).setor,'outros');assert.throws(()=>prepararReuniao({...base(),setor:'forjado'},null,sessao));
});
test('agenda acompanha alteração, cancelamento e troca de mês sem copiar ata ou pessoas',()=>{
 const r={...base(),ata:'SIGILO',participantes:[{nome:'SIGILO'}]};
 const e=agendaReunioes([r],'2026-10')[0];assert.equal(e.reuniaoId,r.id);assert.equal(e.setor,'Financeiro');assert.ok(!JSON.stringify(e).includes('SIGILO'));
 assert.equal(agendaReunioes([{...r,situacao:'cancelado'}],'2026-10').length,0);
 assert.equal(agendaReunioes([{...r,data:'2026-11-01'}],'2026-10').length,0);
 assert.equal(agendaReunioes([{...r,data:'2026-11-01'}],'2026-11')[0].id,e.id);
 assert.throws(()=>agendaReunioes([r],'2026-13'));
});
test('PDF distingue confirmados de convidados e não modifica presença',async()=>{
 const r={...base(),participantes:['presente','ausente','pendente','justificada'].map((presenca,i)=>({id:'p'+i,nome:'Pessoa '+i,presenca}))},antes=structuredClone(r);
 assert.equal(participantesPdf(r).length,1);assert.equal(participantesPdf(r,'assinaturas').length,4);
 const bytes=new Uint8Array(await gerarPdfPresenca(r).arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,8)),'%PDF-1.4');assert.deepEqual(r,antes);
 assert.throws(()=>gerarPdfPresenca({...r,participantes:[]}),/Marque os presentes/);
});
test('PDF pagina listas extensas, escapa texto e conserva o índice dos objetos',async()=>{
 const r={...base(),titulo:'Reunião (segura) \\ RH',participantes:Array.from({length:150},(_,i)=>({...pessoa,id:'p'+i,rhId:'rh'+i,presenca:'presente',nome:'Maria de Lourdes Gonçalves Pereira '+i}))};
 const raw=Buffer.from(await gerarPdfPresenca(r).arrayBuffer()).toString('latin1');assert.ok((raw.match(/\/Type \/Page\b/g)||[]).length>1);
 assert.ok(raw.includes('Reunião \\(segura\\) \\\\ RH'));assert.ok(raw.includes('ASSINATURA'));
 const x=Number(raw.match(/startxref\n(\d+)/)[1]);assert.equal(raw.slice(x,x+4),'xref');
 for(const [,offset] of raw.matchAll(/(\d{10}) 00000 n/g))assert.match(raw.slice(Number(offset)),/^\d+ 0 obj/);
});

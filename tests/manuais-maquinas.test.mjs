import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararConteudoManual,validarAprovacaoManual,resolverReferenciaManual,manualVisivel,urlManual} from '../supabase/functions/_shared/manuais-maquinas.mjs';
const F='20bc7ba9-9bd4-44d7-8954-706d66f2447a',C='6a595e14-2b16-41bd-b6a5-2a375d21463c';
const fonte={id:F,titulo:'Manual de teste',url:'https://fabricante.example/manual.pdf',tipo:'fabricante',modelo:'M1',situacao:'verificado',conferidoEm:'2026-10-24'};
const conteudo=()=>({identificacaoConfirmada:true,fabricante:'Exemplo',modelo:'M1',responsavelId:'rh-1',revisarEm:'2027-01-10',seguranca:'Procedimento validado de teste.',operacao:'Operação fictícia.',fontes:[fonte]});
test('contrato fechado rejeita dinheiro, segredos, auditoria e vínculos não confirmados',()=>{
 for(const campo of ['valor','nf','historico','estado','aprovadoPor','senha','__proto__'])assert.throws(()=>prepararConteudoManual(JSON.parse(`{"${campo}":"teste"}`)),/não permitido/);
 for(const c of [{finalidade:'senha=segredo'}, {treinamentos:[{id:C,cursoId:F}]},{fontes:[{...fonte,token:'segredo'}]}])assert.throws(()=>prepararConteudoManual(c));
 assert.equal(prepararConteudoManual({}).identificacaoConfirmada,false);
 assert.throws(()=>prepararConteudoManual({responsavelId:'Nome livre',responsavel:'Nome'}),/não permitido/);
});
test('URLs HTTPS conservam acesso Drive e rejeitam esquemas, credenciais, token e rede privada',()=>{
 const drive='https://drive.google.com/file/d/exemplo/view?usp=sharing&resourcekey=teste';assert.equal(urlManual(drive),drive);
 for(const url of ['javascript:alert(1)','http://example.com','data:image/png;base64,AA','https://senha:segredo@example.com','https://127.0.0.1/x','https://10.0.0.2/x','https://server.local/x','https://[::1]/','https://example.com/a?access_token=secreto','https://example.com/a?X-Amz-Signature=abc'])assert.throws(()=>urlManual(url));
 assert.throws(()=>prepararConteudoManual({foto:{url:'https://example.com/foto.png'}}),/direito de uso/);
 assert.equal(prepararConteudoManual({foto:{url:'https://example.com/foto.png',usoConfirmado:true}}).foto.usoConfirmado,true);
});
test('fontes, consumíveis, IDs e datas são validados sem adivinhar compatibilidade',()=>{
 const c=prepararConteudoManual({modelo:'M1',fontes:[fonte],consumiveis:[{id:C,nome:'Peça fictícia',compatibilidade:'fabricante',fonteId:F}]});assert.equal(c.consumiveis[0].fonteId,F);
 for(const patch of [{fontes:[fonte,fonte]},{fontes:[{...fonte,id:'nome'}]},{revisarEm:'2026-02-30'},{revisarEm:'2026-99-99'},{revisarEm:'ontem'},{consumiveis:[{id:C,fonteId:F}]},{consumiveis:[{id:C,compatibilidade:'fabricante'}]},{fontes:[{...fonte,situacao:'achismo'}]},{consumiveis:Array.from({length:81},()=>({id:C}))}])assert.throws(()=>prepararConteudoManual(patch));
});
test('compatibilidade confirmada pelo fabricante exige fonte datada do modelo do equipamento',()=>{
 const c={modelo:'M1',fontes:[fonte],consumiveis:[{id:C,compatibilidade:'fabricante',fonteId:F}]};
 for(const patch of [{modelo:'outro'},{url:''},{conferidoEm:''}])assert.throws(()=>prepararConteudoManual({...c,fontes:[{...fonte,...patch}]}),/fabricante/);
});
test('foto do consumível exige origem e uso confirmado sem promover compatibilidade',()=>{
 const foto={url:'https://example.com/peca.png',fonteUrl:'https://example.com/catalogo',legenda:'Peça ilustrativa',usoConfirmado:true};
 const preparar=f=>prepararConteudoManual({consumiveis:[{id:C,nome:'Peça fictícia',foto:f}]}).consumiveis[0];
 const item=preparar(foto);assert.deepEqual(item.foto,foto);assert.equal(item.compatibilidade,'pendente');assert.equal(item.fonteId,'');
 assert.deepEqual(preparar(undefined).foto,{url:'',fonteUrl:'',legenda:'',usoConfirmado:false});
 const drive='https://drive.google.com/file/d/arquivo-ficticio/view?resourcekey=exemplo';assert.equal(preparar({...foto,url:drive}).foto.url,drive);
 for(const patch of [{usoConfirmado:false},{usoConfirmado:'true'},{fonteUrl:''},{url:'http://example.com/peca.png'},{url:'data:image/png;base64,AA'},{fonteUrl:'https://example.com/?token=privado'},{url:'https://10.0.0.1/foto.png'},{url:`https://example.com/${'x'.repeat(2048)}`},{legenda:'x'.repeat(1001)},{legenda:'senha=segredo'},{valor:100},{historico:[]},{principal:'referencia'}])assert.throws(()=>preparar({...foto,...patch}),undefined,JSON.stringify(patch));
 assert.throws(()=>preparar([]),/Foto/);
 assert.throws(()=>prepararConteudoManual({modelo:'M1',consumiveis:[{id:C,foto,compatibilidade:'fabricante'}]}),/fabricante/);
 const confirmado=prepararConteudoManual({modelo:'M1',fontes:[fonte],consumiveis:[{id:C,foto,compatibilidade:'fabricante',fonteId:F}]}).consumiveis[0];assert.equal(confirmado.fonteId,F);assert.equal(confirmado.compatibilidade,'fabricante');
});
test('foto principal preserva preferência legado e só prioriza referência confirmada',()=>{
 const foto={url:'https://example.com/maquina.jpg',fonteUrl:'https://example.com/catalogo',usoConfirmado:true};
 assert.equal(prepararConteudoManual({}).foto.principal,'inventario');assert.equal(prepararConteudoManual({foto}).foto.principal,'inventario');
 assert.equal(prepararConteudoManual({foto:{...foto,principal:'referencia'}}).foto.principal,'referencia');
 for(const patch of [{principal:'qualquer'},{principal:null},{principal:'referencia',url:''},{principal:'referencia',usoConfirmado:false},{principal:'referencia',url:'/Users/exemplo/foto.jpg'}])assert.throws(()=>prepararConteudoManual({foto:{...foto,...patch}}));
});
test('aprovar exige identificação, procedimento, fonte específica e pessoa ativa',()=>{
 const pessoas=[{id:'rh-1',disponivel:true}],c=prepararConteudoManual(conteudo());assert.doesNotThrow(()=>validarAprovacaoManual(c,pessoas));
 for(const patch of [{identificacaoConfirmada:false},{fabricante:''},{modelo:''},{seguranca:''},{operacao:''},{responsavelId:''},{revisarEm:''},{fontes:[{...fonte,modelo:'Outro'}]},{fontes:[{...fonte,situacao:'pendente'}]},{fontes:[{...fonte,conferidoEm:''}]}])assert.throws(()=>validarAprovacaoManual({...c,...patch},pessoas));
 assert.throws(()=>validarAprovacaoManual(c,[{id:'rh-1',disponivel:false}]),/ativo/);
});
test('referências legadas resolvem só por IDs e recusam tipo, ausência e vínculos divergentes',()=>{
 const as=new Map([['maquina-legada',{tipo:'maquina',bemId:'pat-legado'}]]),bs=new Map([['pat-legado',{areaPatrimonio:'maquinas',origemAtivoId:'maquina-legada'}]]);
 const peloAtivo=resolverReferenciaManual({tipo:'ativo',id:'maquina-legada'},as,bs);assert.deepEqual(resolverReferenciaManual({tipo:'bem',id:'pat-legado'},as,bs),peloAtivo);
 assert.equal(peloAtivo.referencias.length,2);
 assert.throws(()=>resolverReferenciaManual({tipo:'carro',id:'maquina-legada'},as,bs));
 assert.throws(()=>resolverReferenciaManual({tipo:'ativo',id:'ausente'},as,bs),e=>e.status===404);
 assert.throws(()=>resolverReferenciaManual({tipo:'ativo',id:'maquina-legada'},new Map([['maquina-legada',{tipo:'veiculo'}]]),bs));
 const duplicados=new Map([...as,['outro',{tipo:'maquina',bemId:'pat-legado'}]]);assert.throws(()=>resolverReferenciaManual({tipo:'bem',id:'pat-legado'},duplicados,bs),e=>e.status===409);
 const trocado=new Map([['pat-legado',{areaPatrimonio:'maquinas',origemAtivoId:'outro'}]]);assert.throws(()=>resolverReferenciaManual({tipo:'ativo',id:'maquina-legada'},as,trocado),e=>e.status===409);
});
test('leitor recebe última versão aprovada sem histórico, rascunho ou extensões futuras',()=>{
 const publicado={estado:'aprovado',conteudo:{modelo:'A'},revisao:2,atualizadoEm:'anterior',valor:123,atualizadoPor:'privado'};
 const rascunho={estado:'rascunho',conteudo:{modelo:'B'},historico:[publicado],revisao:3};const v=manualVisivel(rascunho,false);
 assert.equal(v.revisao,2);assert.equal(v.conteudo.modelo,'A');assert.equal(v.atualizadoEm,'anterior');assert.equal(v.historico,undefined);assert.equal(v.valor,undefined);assert.equal(v.atualizadoPor,undefined);assert.equal(manualVisivel({estado:'rascunho'},false),null);assert.equal(manualVisivel(rascunho,true),rascunho);
});

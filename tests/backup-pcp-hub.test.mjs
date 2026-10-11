/* O PCP NO BACKUP DO HUB (auditoria do PCP v164, 11/10/2026: A2, M20, M21, M29).
 *
 * O caso ruim: o painel-backup puxava o PCP pelo `list` (so O.S. vivas) e
 * gravava "fotos nao incluidas". Ficavam fora as lapides, o diario, os
 * horarios de foto, as Demandas, o selo, as regras, a comissao e as fotos,
 * e a tela dizia "PCP ok". Aqui a function de verdade roda contra um PCP de
 * mentira que fala o protocolo da porta nova (exportarBackup), um GitHub de
 * mentira e buckets em memoria. Dados ficticios.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const REPO='leogpereira-afk/backups-impresilk';
const PCP_URL='https://pcp.invalid/functions/v1/pcp-sync';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
const diaSP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());

// ---------------------------------------------------------------- o PCP de mentira
function pcpFicticio(){
  const linhas=[];
  for(let i=1;i<=4;i++)linhas.push({colecao:'os',id:'os-'+i,apagado:false,atualizado_em:'2026-10-01T10:00:00Z',registro:{id:'os-'+i,numero:'Q'+i}});
  linhas.push({colecao:'os',id:'os-excluida',apagado:true,atualizado_em:'2026-10-02T10:00:00Z',registro:{id:'os-excluida',numero:'L1'}});
  for(let i=1;i<=3;i++)linhas.push({colecao:'auditoria',id:'aud-'+i,apagado:false,atualizado_em:'2026-10-02T10:00:00Z',registro:{osId:'os-1'}});
  linhas.push({colecao:'foto_evento',id:'foto_1',apagado:false,atualizado_em:'2026-10-02T10:00:00Z',registro:{id:'foto_1'}});
  linhas.push({colecao:'performance_fechamentos',id:'fech-1',apagado:false,atualizado_em:'2026-12-01T10:00:00Z',registro:{hash:'f'.repeat(64)}});
  linhas.push({colecao:'performance_regras',id:'v000001',apagado:false,atualizado_em:'2026-10-01T10:00:00Z',registro:{versao:1}});
  linhas.push({colecao:'performance_comissao',id:'com-1',apagado:false,atualizado_em:'2026-12-02T10:00:00Z',registro:{tipo:'aprovacao',hash:'c'.repeat(64)}});
  linhas.push({colecao:'performance_comissao_os_versoes',id:'cov-1',apagado:false,atualizado_em:'2026-12-02T10:00:00Z',registro:{osId:'os-1'}});
  const demandas=[{id:'dem-1',registro:{id:'dem-1',titulo:'Demanda fictícia'},revision:2,mutation_id:'m-2',atualizado_em:'2026-10-08T10:00:00Z'}];
  const cfg={instaladores:['Ana'],performancePCP:{equipes:[]}};
  // pcp_meta (revisão da onda-w1-backup, R4): a cópia de desfazer do robô do ERP e o cache de um mês.
  const meta=[{chave:'carteira-auditoria:2026-10-01T10:00:00Z',valor:{em:'2026-10-01T10:00:00Z',numeros:['Q1'],antes:[{id:'os-1'}]},atualizado_em:'2026-10-01T10:00:00Z'},
    {chave:'entregues:2026-09',valor:{mes:'2026-09',os:[]},atualizado_em:'2026-10-01T03:00:00Z'}];
  return {linhas,demandas,meta,cfg,pagina:4,
    contar(){
      const pcp_registros={};
      for(const c of ['os','auditoria','foto_evento','performance_fechamentos','performance_regras','performance_comissao','performance_comissao_os_versoes'])pcp_registros[c]={total:0,apagados:0};
      for(const l of this.linhas){const c=(pcp_registros[l.colecao] ||= {total:0,apagados:0});c.total++;if(l.apagado)c.apagados++;}
      return {pcp_registros,pcp_demandas:this.demandas.length,...(this.semContagemMeta?{}:{pcp_meta:this.meta.length})};
    },
    // Protocolo da porta exportarBackup do pcp-sync (cursor opaco; aqui, a posição).
    responder(corpo){
      if(corpo.action==='list')return {os:this.linhas.filter(l=>l.colecao==='os'&&!l.apagado).map(l=>l.registro),nextAfter:null};
      if(corpo.action==='getCfg')return {cfg:this.cfg};
      if(corpo.action!=='exportarBackup')return {error:'Ação desconhecida'};
      const tudo=[...this.linhas.map(l=>['r',l]),...this.demandas.map(d=>['d',d]),...this.meta.map(m=>['m',m])];
      const de=corpo.cursor?Number(JSON.parse(corpo.cursor)[2]):0,fatia=tudo.slice(de,de+this.pagina);
      const fim=de+fatia.length>=tudo.length;
      return {ok:true,formato:'pcp-exportacao-1',
        ...(de===0?{cfg:this.cfg,cfgVersao:'2026-10-01T00:00:00Z',contagemInicio:this.contar()}:{}),
        registros:fatia.filter(x=>x[0]==='r').map(x=>x[1]),demandas:fatia.filter(x=>x[0]==='d').map(x=>x[1]),meta:fatia.filter(x=>x[0]==='m').map(x=>x[1]),
        nextCursor:fim?null:JSON.stringify(['r','x',String(de+fatia.length)]),
        ...(fim?{contagemFim:this.contagemFimForcada||this.contar()}:{})};
    }};
}

// ---------------------------------------------------------------- banco, buckets e GitHub
function bucketFalso(arquivos,contador){
  return {
    async list(prefixo,{limit=100,offset=0}={}){
      const pre=prefixo?prefixo+'/':'',nomes=new Map();
      for(const [c,a] of arquivos){
        if(!c.startsWith(pre))continue;
        const resto=c.slice(pre.length),barra=resto.indexOf('/');
        if(barra>=0)nomes.set(resto.slice(0,barra),{name:resto.slice(0,barra),id:null});
        else nomes.set(resto,{name:resto,id:'id-'+c,updated_at:a.em,metadata:{size:a.bytes.length,mimetype:a.tipo,eTag:'"'+sha(a.bytes).slice(0,32)+'"'}});
      }
      const lista=[...nomes.values()].sort((x,y)=>x.name<y.name?-1:1);
      return {data:lista.slice(offset,offset+limit),error:null};
    },
    async download(c){
      contador.baixados.push(c);
      if(contador.falhar?.has(c))return {data:null,error:{message:'falha simulada'}};
      const a=arquivos.get(c);
      return a?{data:new Blob([a.bytes],{type:a.tipo}),error:null}:{data:null,error:{statusCode:'404',message:'Object not found'}};
    },
  };
}
function ambiente(){
  const meta=new Map(),buckets={'pcp-arquivos':new Map(),'pcp-demandas':new Map(),'painel-arquivos':new Map()},contador={baixados:[]};
  const cliente={
    async rpc(nome,args){
      if(nome==='painel_backup_reservar')return {data:true,error:null};
      if(nome==='painel_backup_estado'){const atual=meta.get('backup_status')||{},p=args.p_patch,novo={...atual,...p};if(p.sistemas)novo.sistemas={...(atual.sistemas||{}),...p.sistemas};meta.set('backup_status',structuredClone(novo));return {error:null};}
      return {data:null,error:{message:'rpc '+nome}};
    },
    from(tabela){
      const f={op:'select',filtros:{}};
      const q={select(){return q},eq(k,v){f.filtros[k]=v;return q},maybeSingle(){return q},order(){return q},range(){return q},
        upsert(v){f.op='upsert';f.valor=v;return q},delete(){f.op='delete';return q},
        then(res,rej){try{
          if(tabela!=='painel_meta')return res({data:[],error:null});
          if(f.op==='select')return res({data:meta.has(f.filtros.chave)?{valor:structuredClone(meta.get(f.filtros.chave))}:null,error:null});
          if(f.op==='upsert'){meta.set(f.valor.chave,structuredClone(f.valor.valor));return res({error:null});}
          return res({error:null});
        }catch(e){rej(e);}}};
      return q;
    },
    storage:{from:n=>bucketFalso(buckets[n],contador)},
  };
  const repo=new Map(),pcp=pcpFicticio(),puts=[];
  const fetchFalso=async(url,op={})=>{
    url=String(url);const metodo=op.method||'GET';
    if(url===PCP_URL){
      if(op.headers?.['x-token']!=='token-pcp')return json(401,{error:'Entre no sistema.'});
      return json(200,pcp.responder(JSON.parse(op.body)));
    }
    if(url===`https://api.github.com/repos/${REPO}`)return json(200,{private:true});
    const m=url.match(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if(m){
      const caminho=decodeURIComponent(m[1]);
      if(metodo==='GET')return repo.has(caminho)?json(200,{sha:'blob-'+sha(repo.get(caminho))}):json(404,{message:'Not Found'});
      if(metodo==='PUT'){const b=JSON.parse(op.body);repo.set(caminho,Buffer.from(b.content,'base64'));puts.push(caminho);return json(201,{content:{path:caminho}});}
    }
    return json(404,{message:'?'});
  };
  return {meta,buckets,contador,cliente,repo,pcp,puts,fetchFalso};
}
const ENV={SUPABASE_URL:'https://teste.invalid',SUPABASE_SERVICE_ROLE_KEY:'x',PAINEL_JWT_SECRET:'segredo',PAINEL_TOKEN:'token-painel',
  GITHUB_TOKEN:'gh-teste',GITHUB_REPO:REPO,
  SISTEMAS_BACKUP:JSON.stringify([{key:'pcp',nome:'PCP / Instalacao',url:PCP_URL,listKey:'os',token:'token-pcp'}])};

let codigo=null;
async function funcao(amb){
  if(!codigo){
    let s=await readFile(new URL('../supabase/functions/painel-backup/index.ts',import.meta.url),'utf8');
    s=s.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__bkCliente;')
     .replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,'const verificarJwt=async()=>null;const crachaRevogado=async()=>false;');
    s='const console={...globalThis.console,error:()=>{},warn:()=>{}};\n'+s;
    const b=await build({stdin:{contents:s,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-backup/',import.meta.url))},bundle:true,format:'esm',platform:'neutral',write:false});
    codigo=b.outputFiles[0].text;
  }
  let handler;
  globalThis.__bkCliente=amb.cliente;
  globalThis.Deno={env:{get:k=>ENV[k],toObject:()=>({...ENV})},serve:fn=>{handler=fn;}};
  await import('data:text/javascript;base64,'+Buffer.from(codigo+'\n//'+Math.random()).toString('base64'));
  return async corpo=>{
    const antes=globalThis.fetch;globalThis.fetch=amb.fetchFalso;
    try{
      const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{'x-token':'token-painel','content-type':'application/json'},body:JSON.stringify(corpo)}));
      return {status:r.status,body:await r.json()};
    }finally{globalThis.fetch=antes;}
  };
}
const rodada=f=>f({action:'auto',sistema:'pcp',forcar:true});
const statusPCP=amb=>amb.meta.get('backup_status')?.sistemas?.pcp;
const arquivoDoDia=amb=>{const b=amb.repo.get(`pcp/${diaSP()}.json`);return b?JSON.parse(b.toString('utf8')):null;};
const foto=(n,tamanho=40)=>({bytes:Buffer.from(`foto fictícia ${n} `.padEnd(tamanho,'x')),tipo:'image/jpeg',em:'2026-10-01T10:00:00Z'});

test('PCP no Hub: o arquivo do dia leva lápides, diário, horários de foto, selo, regras, comissão, demandas e config',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  const r=await rodada(f);
  assert.equal(r.status,200,JSON.stringify(r.body));
  const bk=arquivoDoDia(amb);
  assert.ok(bk,'o arquivo do dia foi gravado');
  assert.equal(bk.formato,'pcp-backup-5');
  const chaves=(bk.pcp_registros||[]).map(l=>l.colecao+':'+l.id).sort();
  assert.deepEqual(chaves,amb.pcp.linhas.map(l=>l.colecao+':'+l.id).sort(),'todas as linhas de pcp_registros');
  const lapide=bk.pcp_registros.find(l=>l.id==='os-excluida');
  assert.equal(lapide.apagado,true,'a lápide continua lápide no arquivo');
  assert.deepEqual(bk.pcp_demandas.map(d=>[d.id,d.revision]),[['dem-1',2]]);
  assert.deepEqual(bk.cfg,amb.pcp.cfg);
  assert.deepEqual(bk.divergencias,[]);
  const st=statusPCP(amb);
  assert.equal(st.ok,true,JSON.stringify(st));
  assert.equal(st.porColecao.os,5);assert.equal(st.porColecao.auditoria,3);assert.equal(st.porColecao.performance_comissao,1);
  assert.equal(st.porColecao.pcp_demandas,1);assert.equal(st.lapides,1);
  assert.equal(st.registros,amb.pcp.linhas.length+1+amb.pcp.meta.length);
});

test('PCP no Hub: contagem que não bate (lápide fora da cópia) é ok:false, com a coleção escrita',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  // O PCP conta uma O.S. excluída que a exportação não entregou.
  const contar=amb.pcp.contar.bind(amb.pcp);
  amb.pcp.contar=()=>{const c=contar();c.pcp_registros.os={total:6,apagados:2};return c;};
  await rodada(f);
  const st=statusPCP(amb);
  assert.equal(st.ok,false,JSON.stringify(st));
  assert.match(st.erro,/A contagem não confere/);assert.match(st.erro,/os: 5 exportadas, esperadas 6/);
  assert.ok(st.divergencias.includes('os: 1 excluídas (lápides) exportadas, esperadas 2'),JSON.stringify(st.divergencias));
});

test('PCP no Hub: coleção obrigatória que some da contagem é ok:false (a porta regrediu)',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  const contar=amb.pcp.contar.bind(amb.pcp);
  amb.pcp.contar=()=>{const c=contar();delete c.pcp_registros.performance_comissao_os_versoes;amb.pcp.linhas=amb.pcp.linhas.filter(l=>l.colecao!=='performance_comissao_os_versoes');return c;};
  await rodada(f);
  const st=statusPCP(amb);
  assert.equal(st.ok,false);assert.match(st.erro,/performance_comissao_os_versoes: coleção fora da contagem do PCP/);
});

test('A2: as fotos vão por sha256, incrementais, com teto por rodada; cópia pela metade nunca é ok',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  for(let i=1;i<=30;i++)amb.buckets['pcp-arquivos'].set(`foto_${String(i).padStart(2,'0')}`,foto(i));
  // O anexo da demanda mora numa pasta (<demanda>/<sha>), como o pcp-demandas grava.
  const anexo=foto('anexo');amb.buckets['pcp-demandas'].set('dem-1/'+sha(anexo.bytes),{...anexo,tipo:'application/pdf'});
  await rodada(f);
  let st=statusPCP(amb);
  assert.equal(st.ok,false,'cópia pela metade não é ok');assert.equal(st.emAndamento,true);
  assert.equal(st.arquivosExistentes,31);assert.equal(st.arquivos,25);assert.equal(st.arquivosCopiadosNaRodada,25);
  assert.match(st.erro,/25 de 31/);
  assert.equal(arquivoDoDia(amb).arquivosCompletos,false,'o arquivo do dia diz que os arquivos estão incompletos');
  await rodada(f);
  st=statusPCP(amb);
  assert.equal(st.ok,true,JSON.stringify(st));assert.equal(st.arquivos,31);assert.equal(st.arquivosCopiadosNaRodada,6);
  // Cada arquivo está no destino pelo sha256, com os mesmos bytes.
  for(const [nome,mapa] of [['pcp-arquivos',amb.buckets['pcp-arquivos']],['pcp-demandas',amb.buckets['pcp-demandas']]])
    for(const [,a] of mapa)assert.ok(amb.repo.get(`arquivos/${nome}/${sha(a.bytes)}`)?.equals(a.bytes),nome);
  const bk=arquivoDoDia(amb);
  assert.equal(bk.arquivosCompletos,true);
  assert.equal(bk.arquivos['pcp-arquivos'].length,30);
  assert.deepEqual(bk.arquivos['pcp-demandas'],[{caminho:'dem-1/'+sha(anexo.bytes),tipo:'application/pdf',bytes:anexo.bytes.length,sha256:sha(anexo.bytes)}]);
  // Nada mudou: a rodada seguinte não baixa nada.
  amb.contador.baixados.length=0;
  await rodada(f);
  assert.deepEqual(amb.contador.baixados,[]);assert.equal(statusPCP(amb).ok,true);
  // Um arquivo novo: só ele é baixado.
  amb.buckets['pcp-arquivos'].set('foto_31',foto(31));
  await rodada(f);
  assert.deepEqual(amb.contador.baixados,['foto_31']);
  st=statusPCP(amb);assert.equal(st.arquivos,32);assert.equal(st.ok,true);
});

test('A2: arquivo que não baixa é ok:false com o nome dele, e o que já foi copiado não se perde',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  for(let i=1;i<=3;i++)amb.buckets['pcp-arquivos'].set('foto_'+i,foto(i));
  amb.contador.falhar=new Set(['foto_2']);
  await rodada(f);
  let st=statusPCP(amb);
  assert.equal(st.ok,false);assert.equal(st.emAndamento,false);
  assert.match(st.erro,/1 arquivo não copiado \(pcp-arquivos\/foto_2/);
  assert.equal(st.arquivos,2);
  amb.contador.falhar=null;amb.contador.baixados.length=0;
  await rodada(f);
  assert.deepEqual(amb.contador.baixados,['foto_2'],'só o que faltava');
  st=statusPCP(amb);assert.equal(st.ok,true);assert.equal(st.arquivos,3);
});

test('A2: PCP fora do ar na exportação é ok:false, e os arquivos já copiados não são baixados de novo',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  for(let i=1;i<=3;i++)amb.buckets['pcp-arquivos'].set('foto_'+i,foto(i));
  const responder=amb.pcp.responder.bind(amb.pcp);
  amb.pcp.responder=c=>c.action==='exportarBackup'?{error:'Banco indisponível (fictício).'}:responder(c);
  await rodada(f);
  let st=statusPCP(amb);
  assert.equal(st.ok,false);assert.match(st.erro,/Banco indisponível/);
  amb.pcp.responder=responder;amb.contador.baixados.length=0;
  await rodada(f);
  assert.deepEqual(amb.contador.baixados,[],'o progresso dos arquivos ficou guardado');
  st=statusPCP(amb);assert.equal(st.ok,true,JSON.stringify(st));assert.equal(st.arquivos,3);
});

test('A2: o GitHub pede pausa (limite de gravações): a rodada para sem falha, fica "copiando" e a seguinte continua',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  for(let i=1;i<=5;i++)amb.buckets['pcp-arquivos'].set('foto_'+i,foto(i));
  // Depois de 2 arquivos, o GitHub responde o limite secundário (403 com retry-after).
  const original=amb.fetchFalso;let gravados=0;
  amb.fetchFalso=async(url,op={})=>{
    if(String(url).includes('/contents/arquivos/')&&op.method==='PUT'&&++gravados>2)
      return new Response(JSON.stringify({message:'You have exceeded a secondary rate limit.'}),{status:403,headers:{'retry-after':'60'}});
    return original(url,op);
  };
  await rodada(f);
  let st=statusPCP(amb);
  assert.equal(st.ok,false);assert.equal(st.emAndamento,true,JSON.stringify(st));
  assert.equal(st.arquivos,2);assert.match(st.erro,/pediu pausa/);
  amb.fetchFalso=original;
  await rodada(f);
  st=statusPCP(amb);assert.equal(st.ok,true,JSON.stringify(st));assert.equal(st.arquivos,5);
});

test('A2: 403 do GitHub que não é limite (token sem acesso) é falha dita, não "copiando" para sempre',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  amb.buckets['pcp-arquivos'].set('foto_1',foto(1));
  const original=amb.fetchFalso;
  amb.fetchFalso=async(url,op={})=>String(url).includes('/contents/arquivos/')&&op.method==='PUT'
    ?new Response(JSON.stringify({message:'Resource not accessible by integration'}),{status:403}):original(url,op);
  await rodada(f);
  const st=statusPCP(amb);
  assert.equal(st.ok,false);assert.equal(st.emAndamento,false);assert.match(st.erro,/1 arquivo não copiado/);assert.match(st.erro,/403/);
});

// ---------------------------------------------------------------- revisão da onda-w1-backup (11/10/2026)
/* S3: com uma divergência que não se resolve sozinha, o painel-backup
   regravava o pcp/AAAA-MM-DD.json inteiro (perto de 4 MB) a cada rodada: o
   agendador roda a cada 5 minutos e volta ao PCP enquanto ele está ok:false,
   então eram até 288 gravações por dia, cada uma com a exportação inteira do
   pcp-sync. Agora a mesma divergência já gravada hoje espera 1 hora para a
   nova tentativa; o forcar passa na hora. */
test('revisão onda-w1-backup: divergência que não se resolve não regrava o arquivo do dia a cada rodada do agendador',async()=>{
  const amb=ambiente(),f=await funcao(amb);
  const contar=amb.pcp.contar.bind(amb.pcp);
  amb.pcp.contar=()=>{const c=contar();c.pcp_registros.os={total:6,apagados:2};return c;};
  let exportacoes=0;const responder=amb.pcp.responder.bind(amb.pcp);
  amb.pcp.responder=c=>{if(c.action==='exportarBackup'&&!c.cursor)exportacoes++;return responder(c);};
  const gravacoes=()=>amb.puts.filter(p=>p===`pcp/${diaSP()}.json`).length;
  for(let i=0;i<5;i++)await f({action:'auto',sistema:'pcp'});
  assert.equal(gravacoes(),1,'uma gravação do arquivo do dia, não uma por rodada');
  assert.equal(exportacoes,1,'nem a exportação inteira do PCP a cada rodada');
  let st=statusPCP(amb);
  assert.equal(st.ok,false);assert.match(st.erro,/A contagem não confere/);assert.match(st.erro,/Nova tentativa a partir das \d{2}:\d{2}/);
  assert.ok(!/—/.test(st.erro));
  // Passada 1 hora, tenta de novo.
  const estado=amb.meta.get('backup_arquivos_pcp');estado.registros.em=new Date(Date.now()-61*60000).toISOString();amb.meta.set('backup_arquivos_pcp',estado);
  await f({action:'auto',sistema:'pcp'});
  assert.equal(gravacoes(),2);assert.equal(exportacoes,2);
  // O forcar (pedido explícito, depois de um conserto) passa na hora.
  await f({action:'auto',sistema:'pcp',forcar:true});
  assert.equal(gravacoes(),3);
  // A divergência resolvida: na tentativa seguinte (depois da espera) volta a ok.
  amb.pcp.contar=contar;
  const e2=amb.meta.get('backup_arquivos_pcp');e2.registros.em=new Date(Date.now()-61*60000).toISOString();amb.meta.set('backup_arquivos_pcp',e2);
  await f({action:'auto',sistema:'pcp'});
  st=statusPCP(amb);assert.equal(st.ok,true,JSON.stringify(st));assert.equal(gravacoes(),4);
});

/* R4: o pcp_meta (a cópia de desfazer do robô do ERP e o cache mensal) vai
   no arquivo do dia, conferido pela contagem; a credencial do ERP nunca. */
test('revisão onda-w1-backup: o pcp_meta vai no arquivo do dia, conferido pela contagem do PCP',async()=>{
  let amb=ambiente(),f=await funcao(amb);
  await rodada(f);
  const bk=arquivoDoDia(amb);
  assert.deepEqual((bk.pcp_meta||[]).map(m=>m.chave),amb.pcp.meta.map(m=>m.chave),'o pcp_meta está no arquivo');
  assert.deepEqual(bk.pcp_meta[0].valor,amb.pcp.meta[0].valor);
  assert.equal(bk.contagem.exportado.pcp_meta,2);
  let st=statusPCP(amb);assert.equal(st.ok,true,JSON.stringify(st));assert.equal(st.porColecao.pcp_meta,2);
  // PCP sem a contagem do pcp_meta (a porta regrediu, ou o pcp-sync de antes): ok:false, dito.
  amb=ambiente();f=await funcao(amb);amb.pcp.semContagemMeta=true;
  await rodada(f);
  st=statusPCP(amb);assert.equal(st.ok,false);assert.match(st.erro,/pcp_meta: fora da contagem do PCP/);
  // A credencial do ERP veio na exportação: nada é gravado e a falha é dita.
  amb=ambiente();f=await funcao(amb);
  amb.pcp.meta.push({chave:'mubisys',valor:{accessToken:'credencial-ficticia'},atualizado_em:'2026-10-01T00:00:00Z'});
  await rodada(f);
  st=statusPCP(amb);assert.equal(st.ok,false);assert.match(st.erro,/credencial do ERP/);
  assert.equal(arquivoDoDia(amb),null,'o arquivo do dia não foi gravado');
  assert.ok(![...amb.repo.values()].some(b=>b.toString('utf8').includes('credencial-ficticia')));
});

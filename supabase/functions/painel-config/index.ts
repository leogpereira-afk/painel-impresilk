import {lerEquipeCompromissos, enriquecerCompromissosRH, prepararCompromissoRH, autorCompromissoRH} from '../_shared/compromissos-rh.mjs';
import {inventarioPermitido} from '../_shared/patrimonio-acesso.mjs';
import {lerPessoasPatrimonio, validarVinculoPessoa, prepararPessoasControle} from '../_shared/patrimonio-pessoas.mjs';
import {contextoComercial} from '../_shared/comercial-contexto.ts';
import {gestorComercial} from '../_shared/comercial.mjs';
// ============================================================================
// painel-config — configuracoes e marcacoes manuais (substitui config.js)
//
// O CONTRATO E O MESMO: get/set/merge com as mesmas chaves. Por dentro, a
// mudanca que importa: ov_rec/ov_orc eram UM JSON com todas as marcacoes, e
// marcar um titulo reescrevia o mapa inteiro -- com leitura eventual, duas
// marcacoes seguidas se atropelavam e uma apagava a outra (defeito real, que
// custou dado no modulo de ativos). Agora cada marcacao e UMA LINHA em
// painel_registros: gravar uma nao toca nas outras, e o merge por campo
// acontece linha a linha. A classe do problema deixa de existir.
//
// O get de ov_rec/ov_orc continua devolvendo o MAPA {id: campos} inteiro,
// remontado das linhas -- o cliente nao sabe que o formato interno mudou.
//
// Permissoes preservadas do original:
//   - marcar titulo (ov_*): qualquer pessoa logada;
//   - mudar as REGRAS (config): so quem tem o modulo "configuracoes" (vale
//     para todo mundo, entao nao e para qualquer um);
//   - ler cache_* (diagnostico): so o x-token do servidor.
// Ate 2026-07-22 essas chaves eram ABERTAS (um POST anonimo alterou a config
// em producao). O porteiro continua obrigatorio.
// ============================================================================

import { prepararControle, carimbarPatrimonio } from "../_shared/patrimonio-controles.mjs";
import { prepararConferencia } from "../_shared/patrimonio-fisico.mjs";
import { UUID_INFRA, prepararInfra, infraPermitida } from "../_shared/patrimonio-infra.mjs";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// "marketing" guarda os atalhos do Drive; "bancos", as contas bancarias da aba
// Bancos e Pix. Entram como overlay porque o mecanismo e o mesmo: mapa por id,
// merge sem corrida.
// "assinaturas" sao as contas dos SISTEMAS (Supabase, GitHub, Claude...): dia
// do vencimento, valor e o mes que ja foi pago. Mesmo mecanismo, um registro
// por servico.
const OVERLAYS = new Set(["ov_rec", "ov_orc", "marketing", "bancos", "glossario", "compromissos", "manutencoes", "patrimonio", "patrimonio_controles", "setores", "assinaturas", "permutas", "cobrancas", "campanhas", "grupos_clientes", "planilhas"]);
/* A CONCESSAO DE SETOR FICA DE FORA DE `OVERLAYS`, e isso e a tranca, nao um
   esquecimento. Chave fora dali morre sozinha nos tres verbos genericos:
   `get` responde "chave invalida", `merge` e `removerId` respondem "chave nao
   gravavel". Para abri-la seria preciso um acrescimo DELIBERADO nesta linha --
   e ai o `conferir-papel.mjs` cobra o par em MODULO_DA_CHAVE. A unica porta e
   a acao `setoresDaPessoa`/`salvarSetoresDaPessoa`, master-only, la embaixo. */
const COLECAO_ACESSO_SETOR = "planilhas_acesso";
// Chaves em que cada pessoa so enxerga e mexe no que E DELA. A vendedora nao
// pode ver a agenda da colega, e a direcao ve tudo. Isso e checado no
// SERVIDOR: filtrar so na tela seria conforto, nao separacao.
const POR_DONO = new Set(["compromissos"]);
// Diagnostico de cache pelo x-token (nomes sem o prefixo cache_ da era Blobs).
const CACHES = new Set(["recebiveis", "pagar", "bancos", "orcamentos", "ordens", "dso_hist", "fluxo_mensal", "status"]);

// ---------------------------------------------------------------- conversa
//
// O compromisso nao e so uma linha de agenda: ele PASSA DE MAO. A Barbara
// levanta a medicao, manda para a Karen fazer o orcamento, volta para a
// Barbara fechar. Sem registro, quem recebe nao sabe o que ja foi feito -- e
// quem passou nao sabe o que aconteceu depois.
//
// O historico mora DENTRO do proprio registro (campo `historico`), nao numa
// colecao de auditoria separada. Duas razoes:
//   1. e a conversa DAQUELA tarefa: separada, ela vira log que ninguem le;
//   2. um log externo com o conteudo dos campos e porta dos fundos do RBAC --
//      ja passamos por isso no RH. Dentro do registro, quem pode ver o
//      compromisso ve a conversa, e quem nao pode nao ve nem uma coisa nem a
//      outra. A regra de acesso e uma so.
//
// Quem escreve no historico e o SERVIDOR, sempre: o cliente manda o texto, e
// quem carimba autor e hora e esta funcao. Cliente que mande `historico` no
// corpo tem o campo ignorado (ver `merge`).
const MAX_ARQUIVO = 4 * 1024 * 1024; // ~3 MB reais depois do base64
const BUCKET = "painel-arquivos";
const MAX_HISTORICO = 200; // conversa longa demais vira registro gigante

type Evento = {
  em: string;
  quem: string;
  quemNome: string;
  quemRhId?: string;
  quemRhCodigo?: string;
  paraRhCodigo?: string;
  paraRhId?: string;
  deRhId?: string;
  tipo: "criou" | "passou" | "recado" | "concluiu" | "reabriu";
  texto?: string;
  para?: string;
  paraNome?: string;
  arquivo?: { chave: string; nome: string; mime: string };
};

const comEvento = (registro: any, ev: Evento) => {
  const antes: Evento[] = Array.isArray(registro?.historico) ? registro.historico : [];
  return [...antes, ev].slice(-MAX_HISTORICO);
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sessaoDe(req: Request) {
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  // Sessao revogada vale como sessao inexistente: quem chama ja sabe recusar.
  return s && (await crachaRevogado(sb, "painel", s)) ? null : s;
}

async function lerConfig(): Promise<any> {
  const { data } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  return data?.config ?? null;
}

// Mesmo login inicial do painel-auth; não cria cadastro de pessoa.
const MASTER_USUARIO = (Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo").trim().toLowerCase();

/* COLECOES QUE NAO PODEM SAIR INTEIRAS.
   `planilhas` e a primeira: cada linha pertence a um SETOR, e quem nao tem
   aquele setor nao pode nem saber que a planilha existe -- o registro carrega o
   id do documento no Google, que e a chave dela (quem tem o id, abre).

   A poda mora AQUI, e nao em cada ramo, porque `lerOverlay` e o funil: sao SEIS
   chamadores (get, os tres merges, evento e permutaAnexo, mais o lerArquivo que
   passa null). Espalhar a poda por seis lugares e garantir que o setimo nasca
   sem ela.

   E por isso o `throw` abaixo em vez de um parametro opcional: parametro que
   pode faltar LIBERA por omissao, e omissao e o que acontece. Nao adianta
   confiar no compilador -- a CI do painel NAO type-checa Edge Function nenhuma
   (`npm run lint` e `eslint src`, e o proprio pages.yml diz isso por escrito).
   Entao a defesa e em tempo de execucao: quem chamar sem crivo recebe 500 na
   primeira vez que o ramo rodar, alto e claro, em vez de devolver a lista
   inteira para quem nao devia. */
const PODADAS = new Set(["planilhas"]);

// Mapa {id: campos} remontado das linhas — o formato que o cliente espera.
// `crivo` recebe o registro e devolve o que pode sair (ou null para esconder a
// linha inteira). Obrigatorio para as colecoes de PODADAS.
async function lerOverlay(
  colecao: string,
  soDoDono?: string | null,
  crivo?: ((reg: unknown, id: string) => unknown | null) | null,
): Promise<Record<string, unknown>> {
  if (PODADAS.has(colecao) && typeof crivo !== "function") {
    throw new Error(`lerOverlay("${colecao}") sem crivo: colecao podada por setor.`);
  }
  const out: Record<string, unknown> = {};
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb
      .from("painel_registros").select("id, registro")
      .eq("colecao", colecao).order("id").range(de, de + PASSO - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    for (const r of data ?? []) {
      // Registro sem dono (vindo de backup antigo) so aparece para a direcao.
      if (soDoDono != null && (r.registro as any)?.dono !== soDoDono) continue;
      if (crivo) {
        const podado = crivo(r.registro, r.id);
        if (podado == null) continue;
        out[r.id] = podado;
        continue;
      }
      out[r.id] = r.registro;
    }
    if ((data ?? []).length < PASSO) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const autenticado = !!TOKEN && req.headers.get("x-token") === TOKEN;
  const sessao = await sessaoDe(req);
  const temModulo = (m: string) =>
    !!sessao &&
    (sessao.master === true ||
      (Array.isArray(sessao.perms) && (sessao.perms.includes("*") || sessao.perms.includes(m))));
  const podeConfigurar = temModulo("configuracoes");

  // As chaves novas sao CONTEUDO de um modulo (contas bancarias, materiais de
  // marca, glossario), nao marcacao de titulo. Sem esta amarra, uma conta com
  // acesso so a Orcamentos lia os CNPJs e as chaves Pix da empresa e apagava
  // termo do glossario -- a permissao existia so na tela.
  //
  // Marcações também seguem a permissão do módulo que as utiliza.
  const MODULO_DA_CHAVE: Record<string, string> = {
    ov_rec: "contas-atrasadas",
    ov_orc: "orcamentos",
    bancos: "bancos",
    marketing: "marketing",
    glossario: "glossario",
    compromissos: "compromissos",
    manutencoes: "manutencoes",
    // Duas chaves, um modulo so: os setores existem para o patrimonio.
    patrimonio: "inventario-valores",
    patrimonio_controles: "patrimonio",
    setores: "patrimonio",
    permutas: "permutas",
    campanhas: "campanhas",
    // Sem esta linha `barraChave` cai no `!m` e LIBERA por omissao: qualquer
    // pessoa logada leria a lista inteira de planilhas, com os ids do Google.
    planilhas: "planilhas",
    // Os grupos de compra (CNPJs do mesmo dono) sao vocabulario das analises
    // de venda, que moram na tela de Campanhas.
    grupos_clientes: "campanhas",
    // O diário de cobrança é conteúdo da tela de Contas Atrasadas.
    cobrancas: "contas-atrasadas",
    // As contas dos sistemas sao assunto da direcao: moram na tela de Gestao.
    assinaturas: "gestao",
  };
  // Substituição e exclusão conferem a mesma permissão de leitura e edição.
  const MODULO_APAGAR: Record<string, string> = {
    ov_rec: "contas-atrasadas",
    ov_orc: "orcamentos",
  };
  const barraApagar = (chave: string) => {
    if (!sessao) return null;   // o 401 de cada ramo cuida do sem-sessao
    const m = MODULO_APAGAR[chave];
    if (m && !temModulo(m)) {
      return resposta({ erro: "Apagar marcacoes de " + m + " exige o modulo correspondente." }, 403);
    }
    return null;
  };
  /* LER E GRAVAR NAO SAO A MESMA PERGUNTA -- e ate 15/09/2026 este mapa tratava
     as duas como se fossem uma so.

     A chave `setores` e do Patrimonio: e la que se cria, edita e remove setor.
     Mas MANUTENCOES TAMBEM PRECISA LER a lista, para escrever o nome do setor
     ao lado do carro e da maquina. Com um mapa unico, quem tinha Manutencoes e
     nao tinha Patrimonio levava 403 na leitura; o `Promise.all` da tela
     (src/pages/Manutencoes.jsx) caia inteiro, `itens` ficava null, e a pessoa
     via a pagina de erro dizendo "Voce nao tem acesso a este modulo" -- sobre
     um modulo que ELA TEM. Medido em 15/09/2026: 2 das 10 contas.

     Liberar a chave inteira para `manutencoes` consertaria a leitura e abriria
     a escrita: a tela de Manutencoes passaria a poder APAGAR setor, e apagar
     setor desmancha a etiqueta de todo bem que estava nele. Trocar um defeito
     por outro pior. Por isso o leitor extra e SO LEITOR. */
  const LEITORES_EXTRA: Record<string, string[]> = {
    // A tela de Planilhas escreve o NOME do setor ao lado de cada planilha, e
    // a de conceder mostra "FIN — Financeiro" em vez de uma sigla crua. Ler,
    // so; criar e apagar setor continua sendo do Patrimonio.
    setores: ["manutencoes", "planilhas", "inventario-valores", "seguranca"],
    patrimonio: ["patrimonio", "manutencoes", "seguranca"],
  };
  /* CADASTRAR PLANILHA E DA DIRECAO -- e "direcao" aqui e `master`, nao o
     `ehDirecao` largo deste arquivo (que tambem aceita `perms.includes("*")`).
     Quem tem o modulo `planilhas` USA a lista; quem a monta e quem responde por
     ela. O link de uma planilha e a chave dela: cadastrar uma planilha no setor
     errado nao e um erro de digitacao, e uma concessao. */
  const barraEscritaDePlanilha = (chave: string) => {
    if (chave !== "planilhas") return null;
    if (sessao?.master === true) return null;
    return resposta({ erro: "Só a direção cadastra, edita e remove planilha." }, 403);
  };
  const barraChave = (chave: string, modo: "ler" | "gravar" = "gravar") => {
    // Sem sessao, quem responde e o 401 de cada ramo: o cliente usa esse 401
    // (com semSessao) para deslogar sozinho. Trocar por 403 aqui esconderia a
    // sessao vencida atras de "voce nao tem acesso".
    if (!sessao) return null;
    const m = MODULO_DA_CHAVE[chave];
    if (!m || temModulo(m)) return null;
    /* `gravar` e o padrao DE PROPOSITO: quem acrescentar um ramo novo e
       esquecer de dizer o modo recebe a regra ESTREITA. Esquecimento que tranca
       aparece no mesmo dia, reclamado por quem trabalha; esquecimento que abre
       ninguem vem reclamar. */
    if (modo === "ler" && (LEITORES_EXTRA[chave] ?? []).some(temModulo)) return null;
    return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
  };

  /* ------------------------------------------------------------- SETOR
     A regua fina das Planilhas. Tres decisoes ficam aqui:

     1. SO O MASTER ATRAVESSA. `ehDirecao` (logo abaixo) tambem aceita
        `perms.includes("*")`, e a tela de Acessos NAO chama essa pessoa de
        direcao -- `souDirecao` do cliente e `master === true`. Se a poda usasse
        `ehDirecao`, marcar "Acesso total" para alguem entregaria todas as
        planilhas de todos os setores, sem que a caixa clicada dissesse isso.
        Decisao do dono em 15/09/2026: o setor vale para todo mundo.

     2. A CONCESSAO GUARDA O ID DO SETOR, nunca a sigla. A tela de Patrimonio
        preserva o id e deixa EDITAR a sigla (src/pages/Patrimonio.jsx:468):
        guardar "FIN" faria um "FIN" virar "CTB" revogar todo mundo em silencio,
        e a caixa reapareceria desmarcada como se ninguem tivesse concedido.

     3. FALHA DE LEITURA TRANCA E GRITA. Um `catch` que devolvesse lista vazia
        transformaria banco fora do ar em "voce nao tem setor nenhum" -- zero
        apresentado como resultado. Aqui o erro sobe. */
  const setoresDaPessoa = async (usuario: string): Promise<string[]> => {
    const { data, error } = await sb.from("painel_registros").select("registro")
      .eq("colecao", COLECAO_ACESSO_SETOR).eq("id", usuario).maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const lista = (data?.registro as any)?.setores;
    return Array.isArray(lista) ? lista.map(String) : [];
  };

  /* O crivo de `planilhas`. Devolve o registro que pode sair, ou null para a
     linha nem existir para quem esta perguntando -- e nao basta esconder o
     `docId`: o nome da planilha ja conta o que a casa tem. */
  const crivoDe = async (chave: string) => {
    if (chave !== "planilhas") return null;
    // O master ve tudo -- mas passa pelo crivo do mesmo jeito, para o
    // `lerOverlay` nunca ser chamado sem ele nesta colecao.
    if (sessao?.master === true) return (reg: unknown) => reg;
    const meus = new Set(await setoresDaPessoa(String(sessao?.sub ?? "")));
    return (reg: unknown) => {
      const setor = String((reg as any)?.setor ?? "");
      return setor && meus.has(setor) ? reg : null;
    };
  };

  // Quem NAO e direcao so enxerga e mexe no que e dela nas chaves POR_DONO.
  const ehDirecao = sessao?.master === true ||
    (Array.isArray(sessao?.perms) && sessao.perms.includes("*"));
  const donoDaVez = (chave: string) =>
    POR_DONO.has(chave) && !ehDirecao ? String(sessao?.sub ?? "") : null;
  // Mexer em linha de outra pessoa: barra. Linha que ainda nao existe passa
  // (esta nascendo), e o dono correto e carimbado na gravacao.
  const barraDono = async (chave: string, id: string) => {
    const escopo = donoDaVez(chave);
    if (!escopo) return null;
    const { data } = await sb.from("painel_registros").select("registro")
      .eq("colecao", chave).eq("id", id).maybeSingle();
    const dono = (data?.registro as any)?.dono;
    if (data && dono !== escopo) {
      return resposta({ erro: "Este compromisso nao e seu." }, 403);
    }
    return null;
  };

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  try {
    const segurancaIds=new Set<string>();
    if(corpo.chave==='manutencoes' && sessao && !temModulo('seguranca')) {
      const negado=barraChave('manutencoes',corpo.action==='get'?'ler':'gravar');if(negado)return negado;
      for(const colecao of ['ativo','ativo_lixeira']) for(let de=0;;de+=1000){
        const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',colecao).eq('registro->>tipo','seguranca').order('id').range(de,de+999);
        if(error)throw error;
        for(const r of data||[])segurancaIds.add(r.id);
        if((data||[]).length<1000)break;
      }
      if(corpo.action!=='get') {
        const ids=corpo.action==='merge'?Object.keys(corpo.patch||{}):corpo.id?[String(corpo.id)]:[];
        for(const id of ids){
          const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','manutencoes').eq('id',id).maybeSingle();
          if(error)throw error;
          if(segurancaIds.has(data?.registro?.ativoId)||segurancaIds.has(corpo.patch?.[id]?.ativoId))return resposta({erro:'Esta manutenção exige a permissão Segurança.'},403);
        }
      }
    }
    let orcPermitidos:Set<string>|null=null;
    if(corpo.chave==='ov_orc' && sessao && !gestorComercial(sessao)) {
      const negado=barraChave('ov_orc',corpo.action==='get'?'ler':'gravar');if(negado)return negado;
      const ctx=await contextoComercial(sb,sessao,{}, {historico:false});
      orcPermitidos=new Set(ctx.orcamentos.map((o:any)=>String(o.id)));
      const ids=corpo.action==='merge'?Object.keys(corpo.patch||{}):corpo.id?[String(corpo.id)]:[];
      if(ids.some(id=>!orcPermitidos!.has(id)))return resposta({erro:'Orçamento fora do seu acesso.'},403);
    }
    const overlaySeguro=async(chave:string)=>{
      const valor=await lerOverlay(chave,donoDaVez(chave),await crivoDe(chave));
      if(chave==='patrimonio') return inventarioPermitido(valor,sessao);
      if(chave==='compromissos') return enriquecerCompromissosRH(valor,await lerEquipeCompromissos(sb,{masterUsuario:MASTER_USUARIO,rhIds:Object.values(valor).map((c:any)=>c.donoRhId).filter(Boolean)}));
      if(chave==='manutencoes' && !temModulo('seguranca'))return Object.fromEntries(Object.entries(valor||{}).filter(([,r]:any)=>!segurancaIds.has(r?.ativoId)));
      return chave==='ov_orc'&&orcPermitidos?Object.fromEntries(Object.entries(valor||{}).filter(([id])=>orcPermitidos!.has(id))):valor;
    };
    let equipeRH: Promise<any[]> | undefined;
    const pessoasRH=()=>equipeRH ||= lerPessoasPatrimonio(sb);
    switch (corpo.action) {
      case "pessoasCompromissos": {
        if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if(!temModulo('compromissos'))return resposta({erro:'Sem acesso a Compromissos.'},403);
        const equipe=await lerEquipeCompromissos(sb,{masterUsuario:MASTER_USUARIO});
        return resposta({pessoas:equipe.pessoas});
      }
      case "lerInfra": {
        if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if(!temModulo('patrimonio')&&!temModulo('inventario-valores'))return resposta({erro:'Sem acesso ao Patrimônio.'},403);
        const podeValores=temModulo('inventario-valores');
        const mapa=await lerOverlay('patrimonio_infra',null);
        return resposta({ok:true,podeValores,itens:Object.fromEntries(Object.entries(mapa).map(([id,r])=>[id,infraPermitida(r,podeValores)]))});
      }
      case "salvarInfra": {
        if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if(!temModulo('patrimonio'))return resposta({erro:'Sem acesso ao Patrimônio.'},403);
        const id=corpo.id;
        if(typeof id!=='string'||!UUID_INFRA.test(id))return resposta({erro:'ID inválido.'},422);
        if(!Object.hasOwn(corpo,'versaoAnterior'))return resposta({erro:'Informe a versão do cadastro.'},422);
        const {data:linha,error:erroLinha}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio_infra').eq('id',id).maybeSingle();
        if(erroLinha)throw erroLinha;
        const anterior=linha?.registro||null;
        if(corpo.versaoAnterior!==(anterior?.atualizadoEm??null))return resposta({erro:'Este cadastro mudou. Atualize a lista antes de salvar.'},409);
        const dados=corpo.dados;
        if(!dados||typeof dados!=='object'||Array.isArray(dados))return resposta({erro:'Cadastro inválido.'},422);
        if(Object.hasOwn(dados,'valorMensal')&&!temModulo('inventario-valores'))return resposta({erro:'Valor mensal exige Inventário e valores.'},403);
        const refs:any={};
        for(const campo of ['tecnicoId','contatoId']){
          const ref=dados[campo]??anterior?.[campo];
          if(!ref||ref===anterior?.[campo])continue;
          if(typeof ref!=='string'||!UUID_INFRA.test(ref))return resposta({erro:'Selecione um contato cadastrado.'},409);
          const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio_infra').eq('id',ref).maybeSingle();
          if(error)throw error;
          refs[campo]=data?.registro?.tipo==='contato';
        }
        let novo;try{novo=prepararInfra(dados,anterior,refs,sessao);}catch(e){return resposta({erro:(e as Error).message},(e as any).status||422);}
        if(!temModulo('inventario-valores')&&anterior&&Object.hasOwn(anterior,'valorMensal'))novo.valorMensal=anterior.valorMensal;
        const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:'patrimonio_infra',p_id:id,p_registro:novo,p_anterior:anterior});
        if(error?.code==='23505')return resposta({erro:'Já existe um plano corporativo. Atualize a lista.'},409);
        if(error)throw Object.assign(new Error(error.message),{code:error.code});
        return resposta({ok:true,item:{id,...infraPermitida(data,temModulo('inventario-valores'))}});
      }
      case "guardarContratoInfra":
        if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
        // A escrita compartilha o restante da validação com a leitura.
      case "lerContratoInfra": {
        if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if(!temModulo('inventario-valores'))return resposta({erro:'Contrato exige Inventário e valores.'},403);
        if(corpo.action==='guardarContratoInfra'&&!temModulo('patrimonio'))return resposta({erro:'Cadastro exige Patrimônio.'},403);
        const id=corpo.id;
        if(typeof id!=='string'||!UUID_INFRA.test(id))return resposta({erro:'ID inválido.'},422);
        const {data:linha,error:erroLinha}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio_infra').eq('id',id).maybeSingle();
        if(erroLinha)throw erroLinha;
        const atual=linha?.registro;
        if(!atual||!['internet','plano-corporativo'].includes(atual.tipo))return resposta({erro:'Cadastro não encontrado.'},404);
        if(corpo.action==='lerContratoInfra'){
          const meta=atual.contrato;
          if(!meta?.chave||!String(meta.chave).startsWith(`infra/${encodeURIComponent(id)}/`))return resposta({erro:'Contrato não encontrado.'},404);
          const {data:arquivo,error}=await sb.storage.from(BUCKET).download(meta.chave);
          if(error||!arquivo)return resposta({erro:'Contrato não encontrado.'},404);
          const bytes=new Uint8Array(await arquivo.arrayBuffer());let bruto='';
          for(let i=0;i<bytes.length;i+=0x8000)bruto+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
          return resposta({ok:true,base64:btoa(bruto),mime:meta.mime,nome:meta.nome});
        }
        // Primeira versão: um contrato por cadastro; substituição exige fluxo explícito de versões.
        if(atual.contrato)return resposta({erro:'Este cadastro já possui contrato. Preserve a versão existente.'},409);
        if(corpo.versaoAnterior!==atual.atualizadoEm)return resposta({erro:'Este cadastro mudou. Atualize a lista antes de anexar.'},409);
        const mime=corpo.mime,nome=corpo.nome,base64=corpo.base64;
        if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime)||typeof nome!=='string'||!nome.trim()||nome.length>180)return resposta({erro:'Use PDF ou imagem com nome válido.'},422);
        if(typeof base64!=='string'||!base64||base64.length>MAX_ARQUIVO||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return resposta({erro:'Arquivo inválido ou acima de 3 MB.'},422);
        let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{return resposta({erro:'Arquivo inválido.'},422);}
        const assinatura=mime==='application/pdf'?bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70:
          mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
          mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:
          bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
        if(!assinatura)return resposta({erro:'O conteúdo não corresponde ao tipo de arquivo.'},422);
        const chave=`infra/${encodeURIComponent(id)}/${crypto.randomUUID()}`;
        const {error:up}=await sb.storage.from(BUCKET).upload(chave,bytes,{contentType:mime,upsert:false});
        if(up)throw up;
        const meta={chave,nome:nome.trim(),mime,criadoEm:new Date().toISOString(),criadoPor:String(sessao.sub)};
        const novo={...atual,contrato:meta,atualizadoEm:new Date(Math.max(Date.now(),(Date.parse(atual.atualizadoEm)||0)+1)).toISOString(),atualizadoPor:String(sessao.sub)};
        const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:'patrimonio_infra',p_id:id,p_registro:novo,p_anterior:atual});
        if(error){await sb.storage.from(BUCKET).remove([chave]);throw Object.assign(new Error(error.message),{code:error.code});}
        return resposta({ok:true,contrato:{nome:meta.nome,mime:meta.mime,criadoEm:meta.criadoEm}});
      }
      case "patrimonioParametros": {
        if (!sessao) return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if (!['patrimonio','seguranca','inventario-valores'].some(temModulo)) return resposta({erro:'Sem acesso ao Patrimônio.'},403);
        const cfg=await lerConfig();
        const bruto=(cfg as any)?.parametros?.patrimonioLimiteManutencaoPercentual;
        const valor=typeof bruto==='number'&&Number.isFinite(bruto)&&bruto>=0?bruto:null;
        return resposta({ok:true,limiteManutencaoPercentual:valor});
      }
      case "lerConferencias": {
        if (!sessao) return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if (!temModulo('seguranca')) return resposta({erro:'Sem acesso a Segurança.'},403);
        const itens=await lerOverlay('patrimonio_seguranca_checklists',null);
        return resposta({ok:true,itens});
      }
      case "salvarConferencia": {
        if (!sessao) return resposta({erro:'Entre no sistema.',semSessao:true},401);
        if (!temModulo('seguranca')) return resposta({erro:'Sem acesso a Segurança.'},403);
        const id=String(corpo.id||'');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return resposta({erro:'ID inválido.'},422);
        const {data:existente,error:erroExistente}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio_seguranca_checklists').eq('id',id).maybeSingle();
        if(erroExistente)throw erroExistente;
        if(existente)return resposta({erro:'Conferência já existe.'},409);
        const cameras=[];
        for(let de=0;;de+=1000){
          const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao','ativo').eq('registro->>tipo','seguranca').order('id').range(de,de+999);
          if(error)throw error;
          for(const x of data||[])if(['Câmera','Câmeras / CFTV'].includes(x.registro?.categoria)&&x.registro?.especificacao?.situacao!=='baixado')cameras.push(x.id);
          if((data||[]).length<1000)break;
        }
        let registro;try{registro=prepararConferencia(corpo.dados,null,cameras,sessao,new Date().toISOString());}catch(e){return resposta({erro:(e as Error).message},(e as any).status||422);}
        const {error}=await sb.from('painel_registros').insert({colecao:'patrimonio_seguranca_checklists',id,registro,atualizado_em:registro.criadoEm});
        if(error?.code==='23505')return resposta({erro:'Conferência já existe.'},409);
        if(error)throw error;
        return resposta({ok:true,item:{id,...registro}});
      }
      case "pessoasPatrimonio":
        if (!sessao) return resposta({erro:'Entre no sistema.',semSessao:true},401);
        // Documentos também edita os mesmos veículos e máquinas de Manutenções.
        if (!temModulo('patrimonio') && !temModulo('manutencoes') && !temModulo('documentos') && !temModulo('inventario-valores') && !temModulo('seguranca')) return resposta({erro:'Sem acesso ao cadastro de pessoas do Patrimônio.'},403);
        return resposta({ok:true,pessoas:await pessoasRH()});
      case "ping":
        return resposta({ ok: true });

      case "get": {
        const chave = String(corpo.chave ?? "");
        // Compatibilidade: o cliente antigo pede "cache_status" etc.
        const semPrefixo = chave.startsWith("cache_") ? chave.slice(6) : null;

        if (semPrefixo !== null) {
          if (!CACHES.has(semPrefixo)) return resposta({ erro: "chave invalida" }, 400);
          /* O MARCADOR `semSessao` E O QUE FAZ O CLIENTE VOLTAR AO LOGIN
             (lib/sessao.js so desloga quando ele vem). Este era o unico 401 de
             sessao sem ele: com o cracha vencido, a tela ficava presa num erro
             generico em vez de pedir para entrar de novo. Quando a recusa e do
             x-token (maquina, nao pessoa), o marcador nao vai -- deslogar
             alguem por causa de um token de servico seria pior. */
          if (!autenticado) {
            return resposta({ erro: sessao ? "nao autorizado" : "Entre no sistema.", semSessao: !sessao }, 401);
          }
          const { data } = await sb.from("painel_cache").select("valor").eq("chave", semPrefixo).maybeSingle();
          return resposta({ ok: true, chave, valor: data?.valor ?? null });
        }

        if (chave === "config") {
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          // A config e uma so, mas nem tudo nela e para todo mundo. Motivos,
          // regua de cobranca e nomes de vendedor sao vocabulario das telas --
          // quem abre Orcamentos precisa deles. Ja `parametros` e dinheiro da
          // casa (colchao minimo de caixa, saldo inicial, valor minimo de
          // orcamento): quem nao abre nenhuma tela financeira nao tem por que
          // receber esses numeros. O cliente completa com os padroes dele.
          const cfg = await lerConfig();
          const veDinheiro = ["fluxo-caixa", "contas-atrasadas", "orcamentos", "produtos", "configuracoes"]
            .some((m) => temModulo(m));
          if (cfg && !veDinheiro) {
            const { parametros: _fora, ...resto } = cfg as any;
            return resposta({ ok: true, chave, valor: resto });
          }
          return resposta({ ok: true, chave, valor: cfg });
        }
        if (OVERLAYS.has(chave)) {
          // "ler": o UNICO ramo de leitura desta function. Todos os outros
          // ficam no padrao `gravar`, que e o estreito.
          const barrado = barraChave(chave, "ler");
          if (barrado) return barrado;
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          return resposta({ok:true,chave,valor:await overlaySeguro(chave)});
        }
        return resposta({ erro: "chave invalida" }, 400);
      }

      case "set": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // A substituição integral antiga apagava antes de gravar e perdia
        // alterações concorrentes. A recuperação tem transação própria.
        return resposta({ erro: "Edite cada registro ou use a recuperação de backup para restaurar dados." }, 403);
      }

      // Merge por id. No Blobs isto era le-o-mapa-inteiro + regrava-o-inteiro
      // (a corrida). Aqui cada id e um upsert de UMA linha, fundindo campo a
      // campo com o que a linha ja tem -- dois aparelhos marcando titulos
      // diferentes nunca mais se atropelam.
      case "merge": {
        const chave = String(corpo.chave ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        const patch = corpo.patch && typeof corpo.patch === "object" ? corpo.patch : {};

        if (chave === "config") {
          if (!podeConfigurar) return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
          const { data: merged, error } = await sb.rpc("painel_config_mesclar", {
            p_patch: patch, p_antes: corpo.antes ?? null,
          });
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
          return resposta({ ok: true, valor: merged });
        }

        /* PERMUTA NAO PASSA PELO MERGE GENERICO.
           Duas razoes, e as duas sao de confianca no numero:

           1. O merge le, calcula e grava em tres passos. Perde escrita
              simultanea -- provado contra a producao: dois aceites de O.S.
              disparados juntos terminaram com um so no registro, sem erro
              nenhum. Numa permuta isso e credito que deixa de ser abatido.

           2. O HISTORICO tem que ser verdade. Se ele viesse do cliente, a
              parte interessada reescreveria a propria conta -- e um historico
              assim nao serve para conferir com o parceiro. Quem carimba autor,
              hora e o QUE MUDOU e o banco, comparando o registro antigo com o
              pedido (ver `permuta_mexer`).

           A tela manda `osPatch`, `lancPatch` e os campos no MESMO pedido; a
           funcao aplica tudo numa transacao com a linha travada. */
        /* COBRANÇA: mesmo motivo da permuta -- gravação atômica e autoria
           carimbada pelo servidor. Perder o registro de uma ligação que já
           aconteceu é pior que perder um número: ninguém liga de novo para
           conferir se anotou. */
        if (chave === "cobrancas") {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          const quem = String(sessao?.sub ?? "");
          const quemNome = String(sessao?.nome || quem);
          for (const [id, campos] of Object.entries(patch)) {
            const c = (campos ?? {}) as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(c, "prioridade")) {
              if (!["alta", "normal", "baixa"].includes(String(c.prioridade)) || "chamadoId" in c || "chamado" in c) {
                return resposta({ erro: "Informe uma prioridade válida separadamente do chamado." }, 400);
              }
              const { error } = await sb.rpc("cobranca_priorizar", { p_id: id, p_cliente: String(c.cliente ?? id), p_prioridade: c.prioridade, p_quem: quem });
              if (error) throw Object.assign(new Error(error.message), { code: error.code });
              continue;
            }
            const { error } = await sb.rpc("cobranca_mexer", {
              p_id: id,
              p_quem: quem,
              p_quem_nome: quemNome,
              p_cliente: String(c.cliente ?? id),
              p_chamado_id: String(c.chamadoId ?? ""),
              p_chamado: c.chamado ?? null,
            });
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
          }
          return resposta({ ok: true, valor: await overlaySeguro(chave) });
        }

        /* PERMUTA E CAMPANHA: a mesma maquina (`troca_mexer`), porque e o
           mesmo trabalho -- escolher clientes e aceitar O.S. uma a uma. O que
           muda e a PERGUNTA que a tela faz com isso, e pergunta e conta, nao
           gravacao. Um ramo so aqui e uma funcao so no banco: duplicar a regra
           foi o que deixou o contas a pagar para tras hoje. */
        if (chave === "permutas" || chave === "campanhas") {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          const quem = String(sessao?.sub ?? "");
          const quemNome = String(sessao?.nome || quem);
          for (const [id, campos] of Object.entries(patch)) {
            const c = (campos ?? {}) as Record<string, unknown>;
            const { osPatch, lancPatch, criar, ...limpos } = c;
            /* TIRAR UM LANCAMENTO LEVA O ANEXO DELE. A funcao apaga o objeto
               inteiro (`v_lanc - k`), e com ele a referencia do arquivo -- os
               bytes ficavam no bucket sem ninguem listar, apagar ou saber que
               existem. A protecao ja existe no `removerId` dos vizinhos e
               faltava so aqui. Le ANTES de mexer; se a gravacao falhar, nada
               foi apagado. */
            const paraApagar: string[] = [];
            if (lancPatch && typeof lancPatch === "object") {
              const tirando = Object.entries(lancPatch as Record<string, unknown>)
                .filter(([, v]) => v === null).map(([k]) => k);
              if (tirando.length) {
                const { data: antes } = await sb.from("painel_registros")
                  .select("registro").eq("colecao", chave).eq("id", id).maybeSingle();
                const lancs = ((antes?.registro as any)?.lancamentos ?? {}) as Record<string, any>;
                for (const k of tirando) {
                  const ch = lancs?.[k]?.anexo?.chave;
                  if (typeof ch === "string" && ch) paraApagar.push(ch);
                }
              }
            }
            const { data: reg, error } = await sb.rpc("troca_mexer", {
              p_colecao: chave,
              p_id: id,
              p_quem: quem,
              p_quem_nome: quemNome,
              p_campos: limpos,
              p_os: (osPatch ?? {}) as Record<string, unknown>,
              p_lancamentos: (lancPatch ?? {}) as Record<string, unknown>,
              p_anexo: null,
              p_criar: criar === true,
            });
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
            if (reg === null) {
              const oQue = chave === "campanhas" ? "campanha" : "permuta";
              return resposta({ erro: `Essa ${oQue} nao existe mais -- recarregue a tela.` }, 409);
            }
            // Gravou: agora os bytes do que saiu podem ir. Falha aqui nao
            // derruba a operacao -- o registro ja esta certo.
            if (paraApagar.length) {
              await sb.storage.from(BUCKET).remove(paraApagar).catch(() => {});
            }
          }
          return resposta({ ok: true, valor: await overlaySeguro(chave) });
        }

        if (OVERLAYS.has(chave)) {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          if(chave==='manutencoes') {
            // Conferir o lote inteiro antes da primeira escrita. Um serviço
            // novo ou transferido exige o ID de uma ficha física cadastrada.
            // Correções do histórico de um item retirado mantêm o vínculo antigo.
            for(const [id,campos] of Object.entries(patch)) {
              if(!campos||typeof campos!=='object'||Array.isArray(campos))return resposta({erro:'Manutenção inválida.'},422);
              const {data:antes,error:erroAntes}=await sb.from('painel_registros').select('registro').eq('colecao','manutencoes').eq('id',id).maybeSingle();
              if(erroAntes)throw erroAntes;
              const anterior=antes?.registro;
              const ref=Object.hasOwn(campos,'ativoId')?(campos as any).ativoId:anterior?.ativoId;
              if(typeof ref!=='string'||!ref.trim())return resposta({erro:'Selecione um item cadastrado em Bens e cadastros.'},422);
              if(anterior&&ref===anterior.ativoId)continue;
              const {data:ativo,error:erroAtivo}=await sb.from('painel_registros').select('registro').eq('colecao','ativo').eq('id',ref).maybeSingle();
              if(erroAtivo)throw erroAtivo;
              if(!ativo||!['veiculo','maquina','predial','informatica','seguranca'].includes(ativo.registro?.tipo))return resposta({erro:'Cadastre primeiro o item em Bens e cadastros. Atualize a lista antes de lançar a manutenção.'},409);
            }
          }
          /* AS AÇÕES DO MARKETING MUDARAM DE CASA (10/10/2026): moram nas
             tabelas painel_mkt_* e passam pela painel-marketing, que tem a
             trava de orçamento no banco. Uma aba aberta na versão velha
             ainda mandaria a ação para cá, fora da trava; a resposta manda
             recarregar. Os atalhos do Drive continuam aqui. */
          if (chave === "marketing" && Object.values(patch).some((v: any) => v && typeof v === "object" && v.tipo === "acao")) {
            return resposta({ erro: "As ações do Marketing mudaram de lugar. Recarregue a página para continuar." }, 409);
          }
          const barradoPlanilha = barraEscritaDePlanilha(chave);
          if (barradoPlanilha) return barradoPlanilha;
          for (const [id, campos] of Object.entries(patch)) {
            const barradoDono = await barraDono(chave, id);
            if (barradoDono) return barradoDono;
            const { data, error: erroLeitura } = await sb.from("painel_registros").select("registro")
              .eq("colecao", chave).eq("id", id).maybeSingle();
            if (erroLeitura) throw new Error(erroLeitura.message);
            // A propriedade pode mudar entre a primeira consulta e esta.
            // O mesmo registro usado na escrita precisa estar no meu escopo.
            const escopoDono=donoDaVez(chave);
            if(escopoDono && data && data.registro?.dono!==escopoDono)return resposta({erro:'Este compromisso não é seu.'},403);
            // O CODIGO DA ETIQUETA E GERADO AQUI, nunca no cliente. Ele vai
            // virar adesivo colado no bem: dois computadores cadastrando ao
            // mesmo tempo com a mesma sequencia gerariam duas etiquetas iguais
            // e o inventario passaria a mentir. Gerado uma vez, nunca muda --
            // nem quando o bem troca de setor (o adesivo ja esta colado).
            // A consulta dá uma mensagem imediata; o trigger do banco fecha
            // a corrida entre esta leitura, o vínculo e a exclusão do setor.
            if (chave === "patrimonio" && Object.hasOwn(campos ?? {}, "setorSigla") &&
                (campos as any).setorSigla !== (data?.registro as any)?.setorSigla) {
              const siglaDestino = String((campos as any).setorSigla ?? "");
              if (siglaDestino) {
                const {data:destinos,error:erroDestino}=await sb.from("painel_registros").select("id")
                  .eq("colecao","setores").eq("registro->>sigla",siglaDestino).limit(1);
                if(erroDestino) throw Object.assign(new Error(erroDestino.message),{code:erroDestino.code});
                if(!destinos?.length) return resposta({erro:"O setor selecionado não existe mais. Atualize a lista e escolha outro setor."},409);
              }
            }
            if (chave === "patrimonio" && !(campos as any)?.codigo) {
              const jaTem = (data?.registro as any)?.codigo;
              if (jaTem) {
                (campos as any).codigo = jaTem;
              } else {
                /* NO BANCO, com advisory lock por sigla. A versao daqui lia o
                   maior e somava 1 em dois passos: dois computadores
                   cadastrando ao mesmo tempo saiam com a MESMA etiqueta -- e
                   etiqueta e adesivo colado no bem, nao tem conserto barato.
                   Falhar e melhor que duplicar: sem codigo, o erro sobe e a
                   tela avisa. */
                /* O LOCK DA FUNCAO E `xact`: ele solta quando a RPC retorna, e a
                   gravacao vem no passo seguinte, ja fora dele -- dois
                   cadastros simultaneos ainda podiam sair com o mesmo codigo.
                   Quem garante agora e o INDICE UNICO no banco
                   (20260824c_etiqueta_unica): o segundo e recusado. Aqui a
                   gente so tenta de novo uma vez, para a corrida normal se
                   resolver sozinha em vez de virar erro na cara de quem
                   cadastrou. */
                const sigla = String((campos as any)?.setorSigla ?? "GER");
                const { data: etq, error: erroEtq } = await sb.rpc("patrimonio_proxima_etiqueta", { p_sigla: sigla });
                if (erroEtq || !etq) throw new Error("nao consegui gerar a etiqueta: " + (erroEtq?.message ?? "vazio"));
                (campos as any).codigo = etq as string;
                (campos as any).__etiquetaSigla = sigla;   // so para a retentativa abaixo
              }
            }

            // `historico` NUNCA vem do cliente: e o servidor que carimba autor
            // e hora. Sem isto, qualquer pessoa reescreveria a conversa inteira
            // -- inclusive apagando o que a colega escreveu.
            const { historico: _naoVemDoCliente, ...camposLimpos } = (campos as any) ?? {};
            /* `pagosPatch` funde MES a MES dentro do campo `pagos` (null tira o
               mes). Mandar o mapa inteiro -- como a primeira versao fazia --
               reabria a corrida que este arquivo fechou para registros: o
               celular com estado velho apagava o mes que o desktop tinha
               acabado de marcar. */
            if (camposLimpos.pagosPatch && typeof camposLimpos.pagosPatch === "object") {
              const atualPagos = { ...(((data?.registro as any) ?? {}).pagos ?? {}) };
              for (const [mes, v] of Object.entries(camposLimpos.pagosPatch as Record<string, unknown>)) {
                if (v == null) delete atualPagos[mes];
                else atualPagos[mes] = String(v);
              }
              (camposLimpos as any).pagos = atualPagos;
              delete (camposLimpos as any).pagosPatch;
            }
            let fundido: any = { ...(data?.registro ?? {}), ...camposLimpos };
            if (chave === "patrimonio_controles") {
              try {
                const referencias:any={};
                if(['ramais','celulares'].includes((campos as any)?.tipo ?? (data?.registro as any)?.tipo)) {
                  for(const [campo,colecao,destino] of [['setorId','setores','setor'],['aparelhoId','ativo','aparelho'],['planoId','patrimonio_infra','plano']]) {
                    if(campo==='planoId'&&((campos as any)?.tipo ?? (data?.registro as any)?.tipo)!=='celulares')continue;
                    const vinculo=(campos as any)[campo] ?? (data?.registro as any)?.[campo];
                    if(!vinculo) continue;
                    const {data:ref,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',vinculo).maybeSingle();
                    if(error) throw Object.assign(new Error('Não foi possível conferir o vínculo. Tente novamente.'),{status:503});
                    referencias[destino]=ref?.registro;
                  }
                  referencias.plano=referencias.plano?.tipo==='plano-corporativo';
                  const aparelhoId=(campos as any).aparelhoId ?? (data?.registro as any)?.aparelhoId;
                  if(aparelhoId) {
                    const {data:usos,error}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio_controles').eq('registro->>aparelhoId',aparelhoId);
                    if(error) throw Object.assign(new Error('Não foi possível conferir a alocação do aparelho.'),{status:503});
                    referencias.ocupado=(usos||[]).some((r:any)=>r.id!==id);
                  }
                }
                fundido = prepararControle(prepararPessoasControle(campos,data?.registro,await pessoasRH()), data?.registro ?? null, sessao, new Date().toISOString(),referencias);
              }
              catch (e) { return resposta({erro:(e as Error).message}, (e as any).status || 422); }
            } else if (chave === 'patrimonio') {
              Object.assign(fundido,validarVinculoPessoa(camposLimpos,data?.registro,await pessoasRH(),'responsavel'));
              fundido = carimbarPatrimonio(fundido,data?.registro ?? null,sessao,new Date().toISOString());
            } else if (chave === 'setores') {
              fundido = carimbarPatrimonio(fundido, data?.registro ?? null, sessao, new Date().toISOString());
            }
            if (POR_DONO.has(chave)) {
              const equipe=await lerEquipeCompromissos(sb,{masterUsuario:MASTER_USUARIO});
              const pedido=String((campos as any)?.dono||data?.registro?.dono||sessao.sub);
              if(!data || pedido!==data.registro?.dono) {
                // A mesma revogação central do login alcança prazos de contrato
                // e situações personalizadas do RH. Falha de consulta não libera.
                const {data:revogado,error:erroDestino}=await sb.rpc('acesso_revogado',{p_sistema:'painel',p_sub:pedido,p_papel:''});
                if(erroDestino)throw Object.assign(new Error('Não foi possível conferir o acesso do responsável. Tente novamente.'),{status:503});
                if(revogado)throw Object.assign(new Error('Este responsável não tem acesso ativo à agenda.'),{status:422});
              }
              fundido=prepararCompromissoRH(campos,data?.registro??null,sessao,equipe,new Date().toISOString());
            }
            /* A ETIQUETA PODE COLIDIR NA GRAVACAO (indice unico
               20260824c): o lock da funcao que gera o numero solta antes
               daqui. Uma retentativa resolve a corrida normal -- e se
               colidir de novo, o erro sobe, porque etiqueta repetida e
               adesivo errado colado num bem. */
            const sigla = (fundido as any).__etiquetaSigla;
            delete (fundido as any).__etiquetaSigla;
            const gravar = () => sb.rpc("painel_registro_gravar", {
              p_colecao: chave, p_id: id, p_registro: fundido, p_anterior: data?.registro ?? null,
            });
            let { error } = await gravar();
            if (error && sigla && /painel_patrimonio_codigo_unico|duplicate key/i.test(error.message)) {
              const { data: outra } = await sb.rpc("patrimonio_proxima_etiqueta", { p_sigla: sigla });
              if (outra) {
                (fundido as any).codigo = outra as string;
                ({ error } = await gravar());
              }
            }
            if (error && chave === "patrimonio_controles" && error.code === "23505") return resposta({erro:"Este número ou aparelho já está vinculado nesta aba. Confira o ramal e libere o aparelho anterior antes de trocar."},409);
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
          }
          // Devolve o mapa inteiro, como o original fazia (o cliente atualiza o
          // estado local com ele). Depois de encaminhar, o item some da lista de
          // quem passou -- e por isso que o cliente adota esta resposta.
          return resposta({ ok: true, valor: await overlaySeguro(chave) });
        }
        return resposta({ erro: "chave nao gravavel" }, 403);
      }

      // Recado na conversa do compromisso, com anexo opcional (foto da medicao,
      // PDF do orcamento, croqui). O texto e o autor vao para o `historico` do
      // proprio registro; os BYTES vao para o bucket, porque um PDF dentro do
      // JSON incharia a linha e viajaria em TODA leitura da agenda.
      //
      // Acao propria em vez de um campo do merge: assim o append e atomico do
      // lado do servidor (le, acrescenta, grava) e duas pessoas escrevendo ao
      // mesmo tempo nao apagam o recado uma da outra.
      case "evento": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (!POR_DONO.has(chave)) return resposta({ erro: "chave sem conversa" }, 400);
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        if (!id) return resposta({ erro: "informe o id" }, 400);
        const barradoDono = await barraDono(chave, id);
        if (barradoDono) return barradoDono;

        const { data, error: erroLeitura } = await sb.from("painel_registros").select("registro")
          .eq("colecao", chave).eq("id", id).maybeSingle();
        if(erroLeitura)throw new Error(erroLeitura.message);
        if (!data) return resposta({ erro: "Este compromisso nao existe mais." }, 404);
        const escopoDono=donoDaVez(chave);
        if(escopoDono && data.registro?.dono!==escopoDono)return resposta({erro:'Este compromisso não é seu.'},403);

        const texto = String(corpo.texto ?? "").trim().slice(0, 2000);
        const base64 = String(corpo.base64 ?? "");
        if (!texto && !base64) return resposta({ erro: "Escreva algo ou anexe um arquivo." }, 400);
        if (base64.length > MAX_ARQUIVO) {
          return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);
        }

        const autor=autorCompromissoRH(sessao,await lerEquipeCompromissos(sb,{masterUsuario:MASTER_USUARIO}));
        let arquivo: Evento["arquivo"];
        if (base64) {
          // Chave por compromisso E por evento: trocar de anexo nao apaga o
          // anterior, e a conversa antiga continua abrindo o arquivo dela.
          const nomeArq = String(corpo.nome ?? "anexo");
          const chaveArq = `conversa/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const mime = String(corpo.mime ?? "application/octet-stream");
          const { error } = await sb.storage.from(BUCKET)
            .upload(chaveArq, bytes, { contentType: mime, upsert: false });
          if (error) throw new Error("upload: " + error.message);
          arquivo = { chave: chaveArq, nome: nomeArq, mime };
        }

        const registro: any = {
          ...(data.registro as any),
          historico: comEvento(data.registro, {
            em: new Date().toISOString(),
            ...autor,
            tipo: "recado",
            ...(texto ? { texto } : {}),
            ...(arquivo ? { arquivo } : {}),
          }),
        };
        const { error } = await sb.rpc("painel_registro_gravar", {
          p_colecao: chave, p_id: id, p_registro: registro, p_anterior: data.registro,
        });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return resposta({ ok: true, valor: await overlaySeguro(chave) });
      }

      /* ANEXAR A NOTA DE UM LANCAMENTO DE CREDITO.
         A permuta e uma troca: de um lado as O.S. que ele consumiu, do outro o
         que a Impresilk comprou dele. O credito nao e um numero solto -- e uma
         LISTA de entradas, cada uma com data, o que foi e a sua nota. Sem a
         nota o credito e um numero que alguem digitou, e o parceiro nao tem
         como conferir; e sem estar presa a UMA entrada, a nota nao diz a qual
         delas pertence.

         Os bytes vao para o bucket e so a referencia entra no registro: um PDF
         dentro do JSON incharia a linha e viajaria em TODA leitura da tela.
         Mesma escolha da conversa dos compromissos. */
      case "permutaAnexo": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // A mesma acao serve permuta e campanha: o anexo e a nota do que
        // sustenta o lancamento, nos dois casos.
        const colecao = corpo.chave === "campanhas" ? "campanhas" : "permutas";
        const barrado = barraChave(colecao);
        if (barrado) return barrado;
        const id = String(corpo.id ?? "");
        if (!id) return resposta({ erro: "informe a permuta" }, 400);

        const base64 = String(corpo.base64 ?? "");
        if (!base64) return resposta({ erro: "Escolha um arquivo." }, 400);
        if (base64.length > MAX_ARQUIVO) {
          return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);
        }
        const lancId = corpo.lancId ? String(corpo.lancId) : null;
        const nomeArq = String(corpo.nome ?? "documento").slice(0, 180);
        const mime = String(corpo.mime ?? "application/octet-stream");
        const chaveArq = `permuta/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const { error: erroUp } = await sb.storage.from(BUCKET)
          .upload(chaveArq, bytes, { contentType: mime, upsert: false });
        if (erroUp) throw new Error("upload: " + erroUp.message);

        // Quem carimba autor e hora e a funcao, junto com o evento do
        // historico -- do mesmo jeito que os outros movimentos da permuta.
        const { data: reg, error } = await sb.rpc("troca_mexer", {
          p_colecao: colecao,
          p_id: id,
          p_quem: String(sessao.sub ?? ""),
          p_quem_nome: String(sessao.nome || sessao.sub || ""),
          p_campos: {},
          p_os: {},
          p_lancamentos: {},
          p_anexo: { chave: chaveArq, nome: nomeArq, mime, ...(lancId ? { lancId } : {}) },
          p_criar: false,
        });
        /* Permuta ou lancamento sumiram entre o upload e a gravacao: apaga os
           bytes. Sem isto viram lixo que nenhuma tela lista, ninguem apaga e
           ninguem sabe que existe -- foi o que aconteceu com os arquivos dos
           ativos ate 04/08. */
        if (error) {
          await sb.storage.from(BUCKET).remove([chaveArq]).catch(() => {});
          /* SO A RECUSA DA PROPRIA FUNCAO prova que o lancamento sumiu. Aqui
             cai qualquer erro do banco -- timeout de statement, lock nao
             obtido, queda de conexao -- e a resposta afirmava um FATO sobre o
             dado ("nao existe mais"), mandando a pessoa recarregar e perder o
             anexo que acabou de subir. */
          const some = /nao existe|does not exist/i.test(error.message || "");
          return resposta(
            some
              ? { erro: "Esse lancamento nao existe mais -- recarregue a tela." }
              : { erro: "Nao consegui anexar agora (o banco recusou). O arquivo nao foi guardado; tente de novo." },
            some ? 409 : 503,
          );
        }
        if (reg === null) {
          await sb.storage.from(BUCKET).remove([chaveArq]).catch(() => {});
          return resposta({ erro: "Essa permuta nao existe mais." }, 409);
        }
        return resposta({ ok: true, valor: await lerOverlay(colecao, null, await crivoDe(colecao)) });
      }

      // Baixar um anexo da conversa. A permissao e a MESMA do compromisso: a
      // chave do arquivo tem de estar no historico do registro que a pessoa
      // pode abrir -- pedir uma chave de outro compromisso nao adianta.
      case "lerArquivo": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        const arquivoChave = String(corpo.arquivo ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // Permuta tem anexo mas nao tem dono: o modulo E a permissao.
        if (!POR_DONO.has(chave) && chave !== "permutas" && chave !== "campanhas") {
          return resposta({ erro: "chave sem anexo" }, 400);
        }
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        if (POR_DONO.has(chave)) {
          const barradoDono = await barraDono(chave, id);
          if (barradoDono) return barradoDono;
        }

        const { data } = await sb.from("painel_registros").select("registro")
          .eq("colecao", chave).eq("id", id).maybeSingle();
        /* A CHAVE PEDIDA TEM QUE ESTAR NESTE REGISTRO. Sem esta amarra, quem
           tem o modulo baixaria qualquer arquivo do bucket adivinhando a
           chave -- inclusive de compromisso alheio. Na permuta o anexo mora em
           `anexos`; no compromisso, dentro do `historico`. */
        const reg = (data?.registro as any) ?? null;
        const doAnexo = (Array.isArray(reg?.anexos) ? reg.anexos : [])
          .find((a: any) => a?.chave === arquivoChave);
        // A nota do credito mora DENTRO do lancamento a que pertence.
        const doLancamento = Object.values(reg?.lancamentos ?? {})
          .map((l: any) => l?.anexo)
          .find((a: any) => a?.chave === arquivoChave);
        const doHistorico = (Array.isArray(reg?.historico) ? reg.historico : [])
          .find((e: any) => e?.arquivo?.chave === arquivoChave)?.arquivo;
        const achado = doAnexo || doLancamento || doHistorico;
        if (!achado) return resposta({ erro: "arquivo nao encontrado" }, 404);

        const { data: arq, error } = await sb.storage.from(BUCKET).download(arquivoChave);
        if (error || !arq) return resposta({ erro: "arquivo nao encontrado" }, 404);
        const buf = new Uint8Array(await arq.arrayBuffer());
        let s = "";
        const BLOCO = 0x8000;
        for (let i = 0; i < buf.length; i += BLOCO) s += String.fromCharCode(...buf.subarray(i, i + BLOCO));
        // base64 PURO, sem prefixo data: -- mesmo contrato do painel-ativos.
        return resposta({ ok: true, base64: btoa(s), mime: achado.mime, nome: achado.nome });
      }

      /* ------------------------------------------------ setor das Planilhas
         A UNICA porta da colecao `planilhas_acesso`. Ela fica fora de
         `OVERLAYS` de proposito: get/merge/removerId a recusam por construcao,
         entao nao existe caminho generico para alguem se auto-conceder setor.

         `master === true`, nao `ehDirecao`: `ehDirecao` aceita
         `perms.includes("*")`, e quem tem `*` e uma pessoa comum na tela de
         Acessos. Conceder acesso e da direcao de verdade.

         O ECO E OBRIGATORIO. A resposta devolve o que FICOU GRAVADO, nao o que
         foi pedido, e a tela compara. Permutas (19/08) e campanhas (20/08)
         foram marcadas na tela, responderam ok, e nao concederam nada -- em
         ambos os casos porque alguem filtrou em silencio. Aqui o que nao existe
         na lista de setores volta em `descartados`. */
      case "setoresDaPessoa": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (sessao.master !== true) return resposta({ erro: "Só a direção vê e concede setor." }, 403);
        const usuario = String(corpo.usuario ?? "").trim();
        if (!usuario) return resposta({ erro: "informe o usuario" }, 400);
        return resposta({ ok: true, usuario, setores: await setoresDaPessoa(usuario) });
      }

      case "salvarSetoresDaPessoa": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (sessao.master !== true) return resposta({ erro: "Só a direção vê e concede setor." }, 403);
        const usuario = String(corpo.usuario ?? "").trim();
        if (!usuario) return resposta({ erro: "informe o usuario" }, 400);
        const pedidos = Array.isArray(corpo.setores) ? corpo.setores.map(String) : [];
        // A LISTA FECHADA e a colecao `setores` do Patrimonio, lida agora --
        // nunca uma copia. Setor apagado no Patrimonio deixa de poder ser
        // concedido no mesmo instante.
        const existentes = new Set(Object.keys(await lerOverlay("setores", null)));
        const setores = [...new Set(pedidos.filter((x: string) => existentes.has(x)))];
        const descartados = pedidos.filter((x: string) => !existentes.has(x));
        const { error } = await sb.from("painel_registros").upsert({
          colecao: COLECAO_ACESSO_SETOR, id: usuario,
          registro: { setores, por: String(sessao.sub ?? ""), em: new Date().toISOString() },
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "colecao,id" });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        // Le de volta: o eco e o que FICOU, nao o que foi mandado.
        return resposta({
          ok: true, usuario,
          setores: await setoresDaPessoa(usuario),
          descartados: descartados.length ? descartados : undefined,
        });
      }

      case "lixeiraRegistros": {
        if(!sessao || !ehDirecao) return resposta({erro:"Só a Direção pode recuperar registros."},403);
        const itens=[];
        for(let de=0;;de+=1000){
          const {data,error}=await sb.from("painel_registros").select("id,registro").eq("colecao","registro_lixeira").order("atualizado_em",{ascending:false}).range(de,de+999);
          if(error)throw error;
          itens.push(...(data || []).map((x:any)=>({id:x.id,colecao:x.registro.colecao,nome:x.registro.registro?.nome || x.registro.registro?.titulo || x.registro.id,retiradoEm:x.registro.retiradoEm})));
          if(!data || data.length<1000)break;
        }
        return resposta({ok:true,itens});
      }
      case "recuperarRegistro": {
        if(!sessao || !ehDirecao) return resposta({erro:"Só a Direção pode recuperar registros."},403);
        const {error}=await sb.rpc("painel_registro_recuperar",{p_lixeira_id:String(corpo.id || "")});
        if(error)throw error;
        return resposta({ok:true});
      }

      // Remocao por id: apaga UMA linha do overlay. Existe porque remover via
      // get+set do mapa inteiro reabre a corrida que o merge-por-linha fechou
      // (dois removedores simultaneos ressuscitavam o que o outro apagou).
      case "removerId": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (!OVERLAYS.has(chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        const barradoPlanilha = barraEscritaDePlanilha(chave);
        if (barradoPlanilha) return barradoPlanilha;
        if (chave === "setores") {
          const {data:setor,error:erroSetor}=await sb.from("painel_registros").select("registro").eq("colecao","setores").eq("id",id).maybeSingle();
          if(erroSetor) throw new Error(erroSetor.message);
          if(setor) {
            const {data:bens,error:erroBens}=await sb.from("painel_registros").select("id").eq("colecao","patrimonio").eq("registro->>setorSigla",(setor.registro as any).sigla).limit(1);
            if(erroBens) throw new Error(erroBens.message);
            if(bens?.length) return resposta({erro:"Transfira os bens vinculados antes de remover este setor."},409);
          }
        }
        if (chave === "patrimonio") {
          const { data: fotos, error } = await sb.from("painel_registros").select("id").eq("colecao", "patrimonio_foto").eq("registro->>bemId", id).limit(1);
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
          if (fotos?.length) return resposta({ erro: "Este equipamento tem fotos. Para preservar o histórico, marque como Baixado; para apagar, remova as fotos primeiro." }, 409);
        }
        {
          const barrado2 = barraApagar(chave);
          if (barrado2) return barrado2;
        }
        if (!id) return resposta({ erro: "informe o id" }, 400);
        const barradoDono = await barraDono(chave, id);
        if (barradoDono) return barradoDono;
        // A retirada copia o registro para a lixeira na mesma transação.
        // Referências e bytes dos anexos permanecem recuperáveis.
        const { error } = await sb.rpc("painel_registro_retirar",{p_colecao:chave,p_id:id,p_por:sessao.sub});
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    if ((e as any)?.status===403)return resposta({erro:(e as any).message,codigo:(e as any).codigo||null},403);
    console.error("[painel-config] erro:", e);
    if ((e as any)?.code === "23503") return resposta({ erro: "Este cadastro possui vínculos. Troque ou desvincule os setores, aparelhos, gravadores, contatos, planos ou unidades consumidoras nas fichas relacionadas antes de remover ou alterar." }, 409);
    if ([422,503].includes((e as any)?.status)) return resposta({erro:(e as Error).message},(e as any).status);
    if ((e as any)?.code === "40001") return resposta({ erro: "Outra pessoa alterou este registro. Recarregue antes de salvar." }, 409);
    return resposta({ erro: "Não foi possível salvar ou carregar os dados. Tente novamente." }, 500);
  }
});

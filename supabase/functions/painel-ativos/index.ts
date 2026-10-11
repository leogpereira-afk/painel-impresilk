import {previaReclassificacao} from '../_shared/patrimonio-migracao.mjs';
import {ativoPermitido,exigeInventario,temPermissao,FAMILIAS_EQUIPAMENTO} from '../_shared/patrimonio-acesso.mjs';
import {lerPessoasPatrimonio,validarVinculoPessoa} from '../_shared/patrimonio-pessoas.mjs';
import {prepararFisico} from '../_shared/patrimonio-fisico.mjs';
// ============================================================================
// painel-ativos — documentos, veiculos e maquinas (substitui ativos.js)
//
// MESMO contrato: listar | salvar | remover | guardarArquivo | lerArquivo.
//
// ATENCAO AO FORMATO DO ARQUIVO: este app trafega base64 PURO, SEM o prefixo
// "data:..." -- o cliente faz atob(base64) direto (src/services/ativos.js), e
// um prefixo quebraria a abertura do documento. E o INVERSO do Brief/PCP, que
// trafegam data URLs. Cada app tem seu contrato; aqui se preserva este.
//
// De-para:
//   ativo_<id>    -> painel_registros (colecao='ativo')       [um por linha]
//   arquivo_<id>  -> bytes no bucket painel-arquivos (chave <id>)
//                    + {mime, nome} em painel_registros (colecao='arquivo')
//
// O "um blob por item" do original era a defesa contra dois cadastros
// simultaneos se apagarem (aconteceu no primeiro teste da funcao). Uma linha
// por item no Postgres da a mesma garantia, agora pelo banco.
//
// Permissao: CADA tipo exige o modulo da tela dele -- inclusive nas acoes por
// id, onde o tipo e lido do registro gravado. Tipo sem modulo cadastrado no
// mapa e RECUSADO, nao liberado (ver MODULOS_DO_TIPO, la embaixo).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";
import { papelNoMarketing, papelGrava } from "../_shared/marketing-papel.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const BUCKET = "painel-arquivos";
// "marketing" (logomarcas) e "licitacao" (editais) nao tem a mecanica de
// vencimento dos documentos, mas o esqueleto (item + arquivo anexo) e identico
// -- por isso vivem na mesma colecao, cada um com a sua tela.
// "predial" e o predio em si: cameras, ar condicionado, eletrica, hidraulica,
// portoes, alarme. Nao vence como documento -- o que interessa nele e o
// historico de manutencao e quanto ja custou. Por isso ele NAO aparece na tela
// de Documentos e ativos (que gira em torno de validade) e sim em Manutencoes.
// "seguro" e a apolice: vence como documento (por isso mora na tela de
// Documentos e ativos, e a Home avisa antes), mas carrega duas coisas que
// documento nao tem -- a seguradora e a importancia segurada.
const TIPOS = new Set(["documento", "veiculo", "maquina", "marketing", "licitacao", "predial", "informatica", "seguranca", "seguro"]);

// FICHA TECNICA por familia -- a "especificacao" que a tela de Manutencoes pede
// ao cadastrar. Lista FECHADA e por tipo: sem isso, o objeto vira depositario de
// qualquer chave que um cliente resolva mandar, e um registro que hoje tem 20
// campos passa a ter tamanho imprevisivel (a listagem traz TODOS os itens de uma
// vez -- lixo aqui pesa em toda abertura da tela).
//
// Espelhado em src/lib/calc/manutencoes.js (ESPEC_CAMPOS). Mexeu la, mexe aqui.
const ESPEC_PERMITIDA: Record<string, string[]> = {
  veiculo: ["placa", "marcaModelo", "ano", "cor", "combustivel", "renavam", "chassi", "lugares", "possuiGrade", "motorista", "motoristaId"],
  maquina: ["fabricante", "modelo", "numeroSerie", "ano", "setor", "potencia"],
  predial: ["local", "marcaModelo", "quantidade", "instalacao","setorId","numero","tipoExtintor","capacidade","situacao","testeAutonomiaMinutos","tipoSinalizacao","endereco","unidadeConsumidora","tensao","potencia","kva","potenciaInstalada","placas","inversores","unidadesConsumidoras","tecnicoId"],
  informatica: ["local","marcaModelo","numeroSerie","quantidade","instalacao","fabricante","modelo","imei","processador","memoria","armazenamento","setorId","situacao","rede","enderecoIP","backup","tecnicoId"],
  seguranca: ["local","marcaModelo","numeroSerie","quantidade","instalacao","fabricante","modelo","setorId","situacao","numero","posicao","ambiente","gravadorId","canal","canaisTotais","diasGravacao","empresaMonitoramento","contatoMonitoramento","tipoPortao","automatizador","libera","zonas","sensores","autorizados","copias"],
};
const ESPEC_MAX = 180; // caracteres por campo: e ficha, nao observacao

// Patrimônio consulta o MESMO cadastro de Manutenções, mas sua permissão não
// concede os documentos, anexos, valores ou a edição geral dos ativos.
// Estrutura tem uma ação própria que só edita a ficha predial permitida.
// Esta projeção é uma lista fechada: campos novos no cadastro não vazam aqui.
function equipamentoParaPatrimonio(id: unknown, registro: any) {
  if (!registro || !FAMILIAS_EQUIPAMENTO.includes(registro.tipo)) return null;
  const texto = (valor: unknown, max = 180) =>
    typeof valor === "string" || (typeof valor === "number" && Number.isFinite(valor))
      ? String(valor).trim().slice(0, max) : "";
  const ativoId = texto(id);
  if (!ativoId) return null;
  const ficha = registro.especificacao && typeof registro.especificacao === "object"
    && !Array.isArray(registro.especificacao) ? registro.especificacao : {};
  let campos = registro.tipo === "veiculo"
    ? ["placa", "marcaModelo", "ano"] : registro.tipo === "maquina"
      ? ["fabricante", "modelo", "numeroSerie", "ano", "setor"] : ESPEC_PERMITIDA[registro.tipo];
  if(registro.tipo==='predial')campos=['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança'].includes(registro.categoria)
    ? ['local','setorId','numero','tipoExtintor','capacidade','instalacao','situacao','testeAutonomiaMinutos','tipoSinalizacao']
    : ['Padrão de energia','Transformador','Usina fotovoltaica'].includes(registro.categoria)
      ? ['local','setorId','endereco','unidadeConsumidora','tensao','potencia','kva','potenciaInstalada','placas','inversores','unidadesConsumidoras','tecnicoId','situacao']
      : ['local','marcaModelo','quantidade','instalacao'];
  if(registro.tipo==='seguranca'){
    const especificos:Record<string,string[]>={
      'Câmera':['numero','posicao','ambiente','gravadorId','canal'],'Câmeras / CFTV':['numero','posicao','ambiente','gravadorId','canal'],
      'DVR/NVR':['canaisTotais','diasGravacao'],'Alarme':['empresaMonitoramento','contatoMonitoramento','zonas','sensores','autorizados'],
      'Chave':['copias'],'Portão':['tipoPortao','automatizador','copias'],'Portão / automatizador':['tipoPortao','automatizador','copias'],
      'Acesso facial':['libera','autorizados'],
    };
    campos=['local','marcaModelo','fabricante','modelo','numeroSerie','setorId','situacao',...(especificos[registro.categoria]||[])];
  }
  const listas:Record<string,string[]>={zonas:['id','nome','local'],sensores:['id','nome','local','zonaId'],autorizados:['id','pessoaId','liberadoEm','bloqueadoEm'],copias:['id','numero','pessoaId','entrega','devolucao','tipo']};
  const projetarCampo=(campo:string)=>{
    if(campo==='unidadesConsumidoras')return Array.isArray(ficha[campo])?ficha[campo].filter((x:any)=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x)).slice(0,200):[];
    if(!listas[campo])return texto(ficha[campo],Number.POSITIVE_INFINITY);
    return Array.isArray(ficha[campo])?ficha[campo].slice(0,200).filter((x:any)=>x&&typeof x==='object'&&!Array.isArray(x)).map((x:any)=>Object.fromEntries(listas[campo].map(k=>[k,texto(x[k],Number.POSITIVE_INFINITY)]))):[];
  };
  return {
    id: ativoId,
    tipo: registro.tipo,
    nome: texto(registro.nome),
    ...(["predial","informatica","seguranca"].includes(registro.tipo) ? {
      categoria: texto(registro.categoria, 120),
      identificacao: texto(registro.identificacao, 120),
      observacao: texto(registro.observacao, 2000),
    } : {}),
    responsavel: texto(registro.responsavel),
    responsavelId: texto(registro.responsavelId),
    bemId: texto(registro.bemId),
    especificacao: Object.fromEntries(campos.map(campo => [campo, projetarCampo(campo)])),
    ...(['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança'].includes(registro.categoria) ? {validade:texto(registro.validade,10),arquivoIncendio:registro.arquivoIncendio?{nome:texto(registro.arquivoIncendio.nome),mime:texto(registro.arquivoIncendio.mime)}:null} : {}),
    atualizadoEm: texto(registro.atualizadoEm, 40),
    atualizadoPor: texto(registro.atualizadoPor),
  };
}

// A projeção do Patrimônio nunca volta a ser um registro inteiro de ativos.
// Somente estes campos são editáveis; documentos, valores e vínculos ficam
// como estão na base compartilhada de Manutenções.
function camposEstrutura(item: any, anterior: any) {
  const texto = (valor: unknown, nome: string, max: number, obrigatorio = false) => {
    if (valor == null) valor = "";
    if (typeof valor !== "string") throw new Error("Informe um texto válido em " + nome + ".");
    const limpo = valor.trim();
    if (limpo.length > max) throw new Error(nome + ": use até " + max + " caracteres.");
    if (obrigatorio && !limpo) throw new Error("Informe " + nome + ".");
    return limpo;
  };
  if (item.especificacao !== undefined && (!item.especificacao ||
      typeof item.especificacao !== "object" || Array.isArray(item.especificacao))) {
    throw new Error("Ficha da estrutura inválida.");
  }
  const antes = anterior.especificacao && typeof anterior.especificacao === "object"
    && !Array.isArray(anterior.especificacao) ? anterior.especificacao : {};
  const ficha = { ...antes, ...(item.especificacao || {}) };
  const quantidade = typeof ficha.quantidade === "number" ? ficha.quantidade :
    typeof ficha.quantidade === "string" && /^\d+$/.test(ficha.quantidade.trim()) ? Number(ficha.quantidade) : NaN;
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 1000000) {
    throw new Error("Informe uma quantidade inteira de 1 a 1.000.000.");
  }
  const instalacao = texto(ficha.instalacao, "a data de instalação", 10);
  if (instalacao && (!/^\d{4}-\d{2}-\d{2}$/.test(instalacao) || instalacao.startsWith("0000") ||
      !Number.isFinite(Date.parse(instalacao + "T00:00:00Z")) ||
      new Date(instalacao + "T00:00:00Z").toISOString().slice(0, 10) !== instalacao)) {
    throw new Error("Informe uma data de instalação válida.");
  }
  const campo = (chave: string) => item[chave] === undefined ? anterior[chave] : item[chave];
  return {
    nome: texto(campo("nome"), "o nome", 180, true),
    categoria: texto(campo("categoria"), "a categoria", 120, true),
    identificacao: texto(campo("identificacao"), "a identificação", 120),
    responsavel: texto(campo("responsavel"), "o responsável", 180),
    observacao: texto(campo("observacao"), "a observação", 2000),
    especificacao: {
      ...antes,
      local: texto(ficha.local, "o local", 120, true),
      marcaModelo: texto(ficha.marcaModelo, "a marca e o modelo", 120),
      quantidade: String(quantidade), instalacao,
    },
  };
}

// Igual ao resto do `limpo`: chave ausente MANTEM o que ja estava gravado,
// string vazia limpa. Se o corpo nao traz `especificacao` nenhuma (formulario
// antigo, outra tela), a ficha inteira fica intacta.
function limparEspec(tipo: string, vindo: unknown, antes: unknown) {
  const permitidas = ESPEC_PERMITIDA[tipo];
  if (!permitidas) return {};                       // documento/marketing/licitacao nao tem ficha
  const anterior = (antes ?? {}) as Record<string, unknown>;
  if (vindo === undefined || vindo === null) {
    // Mantem so o que continua permitido para este tipo.
    const so: Record<string, string> = {};
    for (const k of permitidas) {
      if(Array.isArray(anterior[k]))continue;
      const v = String(anterior[k] ?? "").trim();
      if (v) so[k] = v;
    }
    return so;
  }
  // Corpo malformado (string, array, numero) NAO pode apagar a ficha que ja
  // esta gravada: seria perder dado por causa de um cliente com defeito. Trata
  // igual a "nao veio" -- mantem o que estava.
  if (typeof vindo !== "object" || Array.isArray(vindo)) {
    return limparEspec(tipo, undefined, antes);
  }
  const dado = vindo as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of permitidas) {
    if(Array.isArray(anterior[k])||Array.isArray(dado[k]))continue;
    const bruto = k in dado ? dado[k] : anterior[k];
    const v = String(bruto ?? "").trim();
    if (k in dado && v.length > ESPEC_MAX && v !== String(anterior[k] ?? "").trim())
      throw Object.assign(new Error(k + ": use até " + ESPEC_MAX + " caracteres."), {status:422});
    if (v) out[k] = v;                              // campo vazio nao ocupa espaco no registro
  }
  return out;
}
const MAX_ARQUIVO = 4 * 1024 * 1024; // 4 MB em base64 (~3 MB de arquivo)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const b64ParaBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesParaB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) s += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  return btoa(s);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (sessao && await crachaRevogado(sb, "painel", sessao)) {
    return resposta({ erro: "Seu acesso foi encerrado. Fale com a direção.", semSessao: true }, 401);
  }
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  const quem = sessao.nome || sessao.sub || "alguem";

  // Os sete tipos moram nesta colecao mas pertencem a TELAS diferentes, com
  // permissoes diferentes. Sem esta amarra, uma conta com acesso so a
  // Orcamentos listava os editais e podia baixar e apagar arquivo deles --
  // o modulo existia so no menu.
  //
  // ATE 14/09/2026 QUATRO TIPOS FICAVAM DE FORA DESTE MAPA -- documento,
  // veiculo, maquina e seguro -- e o `if (!mod) return true` de entao abria a
  // porta para eles. Qualquer pessoa logada, ainda que a direcao tivesse
  // marcado um unico modulo de consulta, listava, GRAVAVA, APAGAVA e baixava
  // as certidoes da empresa, o contrato social, as apolices com a importancia
  // segurada e a ficha dos carros e maquinas. A tela de conceder acesso
  // prometia o contrario, com todas as letras: "o que nao estiver marcado nao
  // aparece no menu nem responde se a pessoa digitar o endereco".
  //
  // Agora TODO tipo tem dono, e tipo SEM dono RECUSA (ver `podeTipo`). Tipo
  // novo nasce fechado: esquecer de cadastrar aqui tranca a tela, e tranca
  // aparece no mesmo dia -- ao contrario de abrir, que ninguem vai procurar.
  const MODULOS_DO_TIPO: Record<string, string[]> = {
    documento: ["documentos"],
    seguro: ["documentos"],
    // Veiculo e maquina tem DUAS telas: "Documentos e ativos" (a validade do
    // IPVA, do licenciamento, da revisao) e "Manutencoes", que cadastra o
    // mesmo carro para lancar gasto e historico. Exigir so `documentos`
    // trancaria quem cuida da manutencao fora do cadastro dela.
    veiculo: ["documentos", "manutencoes"],
    maquina: ["documentos", "manutencoes"],
    marketing: ["marketing"],
    licitacao: ["licitacoes"],
    predial: ["manutencoes"],
    informatica: ["manutencoes"],
    seguranca: ["manutencoes"],
  };
  const perms: string[] = Array.isArray(sessao.perms) ? sessao.perms : [];
  const podeTipo = (tipo: string) => {
    if (sessao.master === true || perms.includes("*")) return true;
    if(tipo === "seguranca" && !perms.includes("seguranca")) return false;
    const mods = Object.hasOwn(MODULOS_DO_TIPO, tipo) ? MODULOS_DO_TIPO[tipo] : null;
    if (!mods) return false;
    return mods.some((m) => perms.includes(m));
  };
  // Le o tipo do item guardado -- as acoes por id (remover, arquivos) so
  // recebem o id, entao a permissao depende do que esta gravado.
  const tipoDoId = async (id: string): Promise<string | null> => {
    const { data } = await sb.from("painel_registros").select("registro")
      .eq("colecao", "ativo").eq("id", id).maybeSingle();
    return (data?.registro as any)?.tipo ?? null;
  };
  const barraId = async (id: string) => {
    const tipo = await tipoDoId(id);
    if (tipo && !podeTipo(tipo)) return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
    return null;
  };
  // GRAVAR pede mais que ver. O Marketing tem papel dentro do modulo
  // (painel_mkt_papeis): quem e so "visualizacao" ve os materiais, mas nao
  // envia, troca, apaga nem restaura. O papel vem da mesma funcao que a
  // painel-marketing usa, para as duas portas nunca discordarem.
  let papelMkt: string | null = null;
  const barraGravar = async (tipo: string) => {
    if (!podeTipo(tipo)) return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
    if (tipo === "marketing") {
      papelMkt ??= await papelNoMarketing(sb, sessao);
      if (!papelGrava(papelMkt)) return resposta({ erro: "Seu papel no Marketing é só de visualização." }, 403);
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
    let equipeRH: Promise<any[]> | undefined;
    const pessoasRH=()=>equipeRH ||= lerPessoasPatrimonio(sb);
    switch (corpo.action) {
      case "previaMigracaoPatrimonio": {
        if(sessao.master !== true) return resposta({erro:'Só a direção confere a migração.'},403);
        const linhas=[];
        for(let de=0;;de+=1000){
          const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao','ativo').eq('registro->>tipo','predial').order('id').range(de,de+999);
          if(error) throw error;
          linhas.push(...(data||[])); if((data||[]).length<1000)break;
        }
        return resposta({ok:true,somenteLeitura:true,itens:previaReclassificacao(linhas)});
      }
      case "listarPatrimonio": {
        if (sessao.master !== true && !perms.includes("*") && !perms.includes("patrimonio") && !perms.includes("inventario-valores") && !perms.includes("seguranca")) {
          return resposta({ erro: "Voce nao tem acesso ao Patrimônio." }, 403);
        }
        const itens = [];
        const PASSO = 1000;
        for (let de = 0; ; de += PASSO) {
          const { data, error } = await sb.from("painel_registros").select("id,registro")
            .eq("colecao", "ativo").in("registro->>tipo", temPermissao(sessao,"seguranca") ? FAMILIAS_EQUIPAMENTO : FAMILIAS_EQUIPAMENTO.filter(t=>t!=="seguranca"))
            .order("id").range(de, de + PASSO - 1);
          if (error) throw new Error(error.message);
          for (const linha of data ?? []) {
            if(linha.registro?.tipo==='seguranca'&&!temPermissao(sessao,'seguranca'))continue;
            if(linha.registro?.tipo!=='seguranca'&&!temPermissao(sessao,'patrimonio')&&!temPermissao(sessao,'inventario-valores'))continue;
            const item = equipamentoParaPatrimonio(linha.id, linha.registro);
            if (item) itens.push(item);
          }
          if ((data ?? []).length < PASSO) break;
        }
        return resposta({ ok: true, itens });
      }

      case "salvarFisico": {
        const it=corpo.item;
        if(!it||typeof it!=='object'||Array.isArray(it))return resposta({erro:'Item inválido.'},422);
        const edicao=Object.hasOwn(it,'id');
        if(edicao===Object.hasOwn(it,'cadastroId'))return resposta({erro:'Informe o ID da edição ou cadastro.'},422);
        const id=edicao?it.id:it.cadastroId;
        if(typeof id!=='string'||!(edicao?/^[a-zA-Z0-9_-]{1,180}$/.test(id):/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))return resposta({erro:'Identificador inválido.'},422);
        const {data:ant,error:erroAnt}=await sb.from('painel_registros').select('registro').eq('colecao','ativo').eq('id',id).maybeSingle();
        if(erroAnt)throw erroAnt;
        const anterior=ant?.registro||null;
        const tipo=anterior?.tipo??it.tipo;
        if(tipo==='seguranca'&&!temPermissao(sessao,'seguranca')||tipo!=='seguranca'&&!temPermissao(sessao,'patrimonio'))return resposta({erro:'Sem acesso a esta família do Patrimônio.'},403);
        if(edicao&&!anterior)return resposta({erro:'Item retirado. Atualize a lista.'},409);
        if(!edicao&&anterior)return resposta({ok:true,item:equipamentoParaPatrimonio(id,anterior)});
        if(edicao&&corpo.versao!==anterior.atualizadoEm)return resposta({erro:'Este item mudou. Recarregue antes de salvar.'},409);
        if(!edicao){const {data:retirado,error}=await sb.from('painel_registros').select('id').eq('colecao','ativo_lixeira').eq('id',id).maybeSingle();if(error)throw error;if(retirado)return resposta({erro:'Cadastro já foi retirado.'},409);}
        const ficha={...(anterior?.especificacao||{}),...(it.especificacao||{})};
        const refs:any={inventario:temPermissao(sessao,'inventario-valores'),pessoas:await pessoasRH()};
        if(ficha.setorId){const {data,error}=await sb.from('painel_registros').select('id').eq('colecao','setores').eq('id',ficha.setorId).maybeSingle();if(error)throw error;refs.setor=!!data;refs.setorId=ficha.setorId;}
        if(ficha.tecnicoId){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio_infra').eq('id',ficha.tecnicoId).maybeSingle();if(error)throw error;refs.tecnico=data?.registro?.tipo==='contato';}
        if(Array.isArray(ficha.unidadesConsumidoras)){
          refs.unidadesConsumidoras=[];
          for(const unidadeId of ficha.unidadesConsumidoras){
            if(typeof unidadeId!=='string')continue;
            const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','ativo').eq('id',unidadeId).maybeSingle();if(error)throw error;
            if(data?.registro?.tipo==='predial'&&data.registro.categoria==='Padrão de energia'&&data.registro.especificacao?.situacao!=='baixado')refs.unidadesConsumidoras.push(unidadeId);
          }
        }
        if(ficha.gravadorId){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','ativo').eq('id',ficha.gravadorId).maybeSingle();if(error)throw error;refs.gravador=data?.registro;refs.gravadorId=ficha.gravadorId;}
        if(ficha.gravadorId&&ficha.canal){
          for(let de=0;;de+=1000){
            const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao','ativo').eq('registro->>tipo','seguranca').order('id').range(de,de+999);
            if(error)throw error;
            if((data||[]).some((r:any)=>r.id!==id&&['Câmera','Câmeras / CFTV'].includes(r.registro?.categoria)&&r.registro?.especificacao?.situacao!=='baixado'&&r.registro?.especificacao?.gravadorId===ficha.gravadorId&&String(r.registro?.especificacao?.canal||'')===String(ficha.canal)))refs.ocupadoCanal=true;
            if((data||[]).length<1000)break;
          }
        }
        if(Object.hasOwn(it,'bemId')) {
          if(typeof it.bemId!=='string')return resposta({erro:'Vínculo com inventário inválido.'},422);
          if((it.bemId||'')!==(anterior?.bemId||''))exigeInventario(sessao);
          const {data:origens,error}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio').eq('registro->>origemAtivoId',id);
          if(error)throw Object.assign(new Error('Não foi possível conferir o vínculo existente.'),{status:503});
          if((origens||[]).some((r:any)=>r.id!==it.bemId))return resposta({erro:'Este equipamento já tem vínculo no inventário. Confira a ficha do bem antes de trocar ou limpar o vínculo.'},409);
        }
        if(Object.hasOwn(it,'bemId')&&it.bemId){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio').eq('id',it.bemId).maybeSingle();if(error)throw error;refs.bem=!!data&&(!data.registro?.origemAtivoId||data.registro.origemAtivoId===id);}
        let campos;
        try{campos=prepararFisico(it,anterior,refs);Object.assign(campos,validarVinculoPessoa(it,anterior,refs.pessoas,'responsavel'));}
        catch(e){return resposta({erro:(e as Error).message},(e as any).status||422);}
        const agora=new Date(Math.max(Date.now(),(Date.parse(anterior?.atualizadoEm||'')||0)+1)).toISOString();
        const novo={...(anterior||{}),...campos,...(Object.hasOwn(it,'bemId')?{bemId:it.bemId}:{}),id,criadoEm:anterior?.criadoEm||agora,atualizadoEm:agora,atualizadoPor:quem};
        const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:'ativo',p_id:id,p_registro:novo,p_anterior:anterior});
        if(error)throw Object.assign(new Error(error.message),{code:error.code});
        return resposta({ok:true,item:equipamentoParaPatrimonio(id,data)});
      }
      case "guardarArquivoIncendio":
      case "lerArquivoIncendio": {
        if(!temPermissao(sessao,'patrimonio'))return resposta({erro:'Sem acesso ao Patrimônio.'},403);
        const id=String(corpo.id||'');
        if(!/^[a-zA-Z0-9_-]{1,180}$/.test(id))return resposta({erro:'ID inválido.'},422);
        const {data:linha,error:erroLinha}=await sb.from('painel_registros').select('registro').eq('colecao','ativo').eq('id',id).maybeSingle();
        if(erroLinha)throw erroLinha;
        const atual=linha?.registro;
        if(!atual||atual.tipo!=='predial'||!['Extintor','AVCB'].includes(atual.categoria))return resposta({erro:'Item de incêndio não encontrado.'},404);
        if(corpo.action==='lerArquivoIncendio'){
          const meta=atual.arquivoIncendio;
          if(!meta?.chave||!String(meta.chave).startsWith(`incendio/${encodeURIComponent(id)}/`))return resposta({erro:'Anexo não encontrado.'},404);
          const {data:arq,error}=await sb.storage.from(BUCKET).download(meta.chave);
          if(error||!arq)return resposta({erro:'Anexo não encontrado.'},404);
          return resposta({ok:true,base64:bytesParaB64(await arq.arrayBuffer()),mime:meta.mime,nome:meta.nome});
        }
        if(atual.arquivoIncendio)return resposta({erro:'Este item já possui anexo. Preserve o documento existente.'},409);
        const mime=String(corpo.mime||''),nome=String(corpo.nome||'').trim();
        if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime)||!nome||nome.length>180)return resposta({erro:'Use PDF ou imagem com nome válido.'},422);
        const b64=String(corpo.base64||'');if(!b64||b64.length>4*1024*1024)return resposta({erro:'Arquivo deve ter até 3 MB.'},413);
        let bytes;try{bytes=b64ParaBytes(b64);}catch{return resposta({erro:'Arquivo inválido.'},422);}
        const assinatura=mime==='application/pdf'?bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70:
          mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
          mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:
          bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
        if(!assinatura)return resposta({erro:'O conteúdo não corresponde ao tipo do arquivo.'},422);
        const chave=`incendio/${encodeURIComponent(id)}/${crypto.randomUUID()}`;
        const {error:up}=await sb.storage.from(BUCKET).upload(chave,bytes,{contentType:mime,upsert:false});if(up)throw up;
        const meta={chave,nome,mime,criadoEm:new Date().toISOString(),criadoPor:String(sessao.sub||'')};
        const novo={...atual,arquivoIncendio:meta,atualizadoEm:new Date(Math.max(Date.now(),(Date.parse(atual.atualizadoEm)||0)+1)).toISOString(),atualizadoPor:quem};
        const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:'ativo',p_id:id,p_registro:novo,p_anterior:atual});
        if(error){await sb.storage.from(BUCKET).remove([chave]);throw Object.assign(new Error(error.message),{code:error.code});}
        return resposta({ok:true,arquivoIncendio:{nome,mime}});
      }

      case "salvarTelefonia":
      case "salvarEstrutura": {
        const telefonia = corpo.action === "salvarTelefonia";
        const tipoFicha = telefonia ? "informatica" : "predial";
        if (sessao.master !== true && !perms.includes("*") && !perms.includes("patrimonio")) {
          return resposta({ erro: "Voce nao tem acesso ao Patrimônio." }, 403);
        }
        const it = corpo.item;
        if (!it || typeof it !== "object" || Array.isArray(it)) return resposta({ erro: "Item inválido." }, 400);
        if (it.tipo !== undefined && it.tipo !== tipoFicha) return resposta({ erro: "Estrutura cadastra somente itens prediais." }, 400);
        if (it.id !== undefined && it.cadastroId !== undefined) return resposta({ erro: "Informe somente o identificador da edição ou do novo cadastro." }, 400);
        const edicao = it.id !== undefined;
        const id = edicao ? it.id : it.cadastroId;
        const valido = typeof id === "string" && (edicao ? /^[a-zA-Z0-9_-]{1,180}$/.test(id) :
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
        if (!valido) return resposta({ erro: "Identificador inválido. Reabra o cadastro." }, 400);
        const { data: ant, error: falhaLeitura } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo").eq("id", id).maybeSingle();
        if (falhaLeitura) throw new Error(falhaLeitura.message);
        const anterior = ant?.registro;
        if (anterior && (anterior.tipo !== tipoFicha || (telefonia && !["Telefone","Central telefônica"].includes(anterior.categoria)))) return resposta({ erro: "Este item não pertence à Estrutura." }, 403);
        if (edicao && !anterior) return resposta({ erro: "Este item foi retirado. Atualize a lista antes de continuar." }, 409);
        // Resposta perdida e duplo clique repetem a identidade, jamais a edição.
        if (!edicao && anterior) return resposta({ ok: true, item: equipamentoParaPatrimonio(id, anterior) });
        if (edicao && (typeof corpo.versao !== "string" || corpo.versao !== (anterior.atualizadoEm || ""))) {
          return resposta({ erro: "Este registro mudou durante a edição. Recarregue antes de salvar." }, 409);
        }
        if (!edicao) {
          const { data: retirado, error } = await sb.from("painel_registros").select("id")
            .eq("colecao", "ativo_lixeira").eq("id", id).maybeSingle();
          if (error) throw new Error(error.message);
          if (retirado) return resposta({ erro: "Este cadastro foi retirado. Reabra a tela para cadastrar outro item." }, 409);
        }
        let campos;
        try {
          if(telefonia) {
            if(!String(it.nome||'').trim() || String(it.nome).length>180 || !['Telefone','Central telefônica'].includes(it.categoria)) throw new Error('Informe o nome e escolha Telefone ou Central telefônica.');
            if(anterior && anterior.categoria!==it.categoria) throw new Error('A categoria do aparelho não pode ser trocada.');
            campos={nome:String(it.nome).trim(),categoria:it.categoria,identificacao:String(it.identificacao||'').trim().slice(0,120),especificacao:limparEspec('informatica',it.especificacao,anterior?.especificacao)};
            if(Object.hasOwn(it,'bemId') && (it.bemId||'')!==(anterior?.bemId||'')) {
              exigeInventario(sessao);
              const {data:origens,error:falhaOrigem}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio').eq('registro->>origemAtivoId',id);
              if(falhaOrigem) throw Object.assign(new Error('Não foi possível conferir o vínculo existente.'),{status:503});
              if((origens||[]).some((r:any)=>r.id!==it.bemId)) throw Object.assign(new Error('Este aparelho já tem vínculo no inventário. Confira a ficha do bem antes de trocar o vínculo.'),{status:409});

              if(it.bemId) {
                const {data:bem,error}=await sb.from('painel_registros').select('registro').eq('colecao','patrimonio').eq('id',it.bemId).maybeSingle();
                if(error) throw Object.assign(new Error('Não foi possível conferir o inventário.'),{status:503});
                if(!bem || (bem.registro.origemAtivoId && bem.registro.origemAtivoId!==id)) throw Object.assign(new Error('Bem inexistente ou vinculado a outro equipamento.'),{status:409});
                const {data:ligados,error:falha}=await sb.from('painel_registros').select('id').eq('colecao','ativo').eq('registro->>bemId',it.bemId);
                if(falha) throw Object.assign(new Error('Não foi possível conferir os vínculos.'),{status:503});
                if((ligados||[]).some((r:any)=>r.id!==id)) throw Object.assign(new Error('Este bem já está vinculado a outro equipamento.'),{status:409});
              }
              campos.bemId=String(it.bemId||'');
            }
          } else campos=camposEstrutura(it, anterior || {});
          Object.assign(campos,validarVinculoPessoa(it,anterior,await pessoasRH(),'responsavel'));
        }
        catch (e) { return resposta({ erro: (e as Error).message }, (e as any).status || 422); }
        // Versão sempre muda, mesmo em duas gravações no mesmo milissegundo.
        const agora = new Date(Math.max(Date.now(), (Date.parse(anterior?.atualizadoEm || "") || 0) + 1)).toISOString();
        const novo = { ...(anterior || {}), ...campos, id, tipo: tipoFicha,
          atualizadoEm: agora, atualizadoPor: quem, criadoEm: anterior?.criadoEm || agora };
        const { data, error } = await sb.rpc("painel_registro_gravar", {
          p_colecao: "ativo", p_id: id, p_registro: novo, p_anterior: anterior || null,
        });
        if (error) {
          // Dois envios do mesmo cadastro podem chegar antes da primeira gravação.
          if (!edicao && error.code === "40001") {
            const { data: existente, error: falha } = await sb.from("painel_registros").select("registro")
              .eq("colecao", "ativo").eq("id", id).maybeSingle();
            if (falha) throw new Error(falha.message);
            if (existente?.registro?.tipo === tipoFicha) return resposta({ ok: true, item: equipamentoParaPatrimonio(id, existente.registro) });
          }
          throw Object.assign(new Error(error.message), { code: error.code });
        }
        const item = equipamentoParaPatrimonio(id, data);
        if (!item) throw new Error("A gravação não retornou o item confirmado.");
        return resposta({ ok: true, item });
      }

      case "listar": {
        // Listar não apaga arquivos. Itens retirados permanecem na lixeira.
        const itens: any[] = [];
        const PASSO = 1000;
        for (let de = 0; ; de += PASSO) {
          const { data, error } = await sb.from("painel_registros").select("registro")
            .eq("colecao", "ativo").order("id").range(de, de + PASSO - 1);
          if (error) throw new Error(error.message);
          itens.push(...(data ?? []).map((r: any) => r.registro));
          if ((data ?? []).length < PASSO) break;
        }
        // Filtra pelo que a sessao pode ver: a tela ja separava por tipo,
        // mas o servidor mandava tudo -- inclusive editais e materiais de
        // marca para quem nao tem esses modulos.
        return resposta({ ok: true, itens: itens.filter((i: any) => podeTipo(i?.tipo)).map(i=>ativoPermitido(i,sessao)) });
      }

      case "salvar": {
        const it = corpo.item ?? {};
        const tipo = String(it.tipo ?? "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        { const b = await barraGravar(tipo); if (b) return b; }
        if (!String(it.nome ?? "").trim()) return resposta({ erro: "informe o nome" }, 400);

        const agora = new Date().toISOString();
        const id = it.id || it.cadastroId || crypto.randomUUID();
        const { data: ant, error: falhaLeitura } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo").eq("id", id).maybeSingle();

        if(falhaLeitura) throw new Error(falhaLeitura.message);
        if(it.cadastroId && !/^[a-zA-Z0-9-]{1,180}$/.test(it.cadastroId)) return resposta({erro:"Identificador inválido."},400);

        // Conferir SO o tipo do corpo deixava a porta aberta: quem perdeu o
        // modulo Licitacoes mandava o mesmo id com tipo "documento" e o edital
        // trocava de gaveta -- passando a ser legivel por qualquer pessoa
        // logada. O que vale e o tipo JA GRAVADO, e ele nao pode mudar.
        // Mandou id de um item que nao existe mais = alguem apagou enquanto o
        // formulario estava aberto. Gravar aqui RESSUSCITARIA o registro -- so
        // que sem o arquivo, que ja foi removido do bucket junto. Melhor recusar
        // e mandar cadastrar de novo. (Item novo nunca chega com id: quem gera
        // e esta funcao, logo acima.)
        if (it.id && !ant) {
          return resposta({
            erro: "Este item foi apagado por alguem enquanto voce editava. Cadastre de novo se ainda precisar dele.",
          }, 409);
        }

        if (it.cadastroId && !ant) {
          const {data: retirado,error} = await sb.from("painel_registros").select("id").eq("colecao","ativo_lixeira").eq("id",id).maybeSingle();
          if(error) throw new Error(error.message);
          if(retirado) return resposta({erro:"Este cadastro foi retirado. Reabra a tela para cadastrar outro item."},409);
        }
        const tipoGravado = (ant?.registro as any)?.tipo;
        if (tipoGravado) {
          { const b = await barraGravar(tipoGravado); if (b) return b; }
          if (tipoGravado !== tipo) {
            return resposta({ erro: "Nao da para mudar o tipo de um item ja cadastrado." }, 400);
          }
        }

        // O QUE NAO VEIO NO CORPO FICA COMO ESTAVA.
        //
        // Antes, `limpo` era montado so a partir de `it`: campo ausente virava
        // "" ou 0. Isso funcionava enquanto UM formulario mandava o registro
        // inteiro. Agora Manutencoes tambem cadastra veiculo e maquina, e o
        // formulario de la nao tem os campos de documento -- salvar um carro
        // por ali zerava validade (IPVA), emissao, medidor e ate o anexo do
        // CRLV, sem aviso e sem erro. Quem descobre e quem procura o documento.
        //
        // A regra fica no SERVIDOR, nao em "lembrar de espalhar ...item no
        // cliente": e o unico lugar por onde todos os formularios passam.
        // `undefined` (chave ausente) = mantem; "" explicito = limpa.
        const a = (ant?.registro ?? {}) as Record<string, unknown>;
        if(FAMILIAS_EQUIPAMENTO.includes(tipo) && !temPermissao(sessao,'inventario-valores') &&
          ['valor','nf','valorSegurado','arquivoNome','temArquivo','miniatura'].some(k=>Object.hasOwn(it,k))) exigeInventario(sessao);
        const txt = (v: unknown, antes: unknown) =>
          String((v ?? antes ?? "") as string).trim();
        const numOu = (v: unknown, antes: unknown) =>
          v === undefined ? (Number(antes) || 0) : (Number(v) || 0);

        const acompanhar = (v: any) => {
          const x = v && typeof v === "object" && !Array.isArray(v) ? v : {};
          const data = String(x.prazoAcao || "");
          if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Prazo inválido");
          return { proximaAcao: String(x.proximaAcao || "").slice(0,500), prazoAcao:data,
            decisao:String(x.decisao || "").slice(0,2000),resultado:String(x.resultado || "").slice(0,2000),
            valorContratado:(Number.isFinite(Number(x.valorContratado)) ? Math.max(0,Number(x.valorContratado)) : 0),
            checklist:(Array.isArray(x.checklist)?x.checklist:[]).slice(0,30).map((c:any,i:number)=>({id:String(c.id || i).slice(0,80),texto:String(c.texto || "").slice(0,300),feito:c.feito===true})).filter((c:any)=>c.texto.trim()) };
        };
        const limpo = {
          ...(a.bemId ? {bemId:a.bemId} : {}),
          ...(a.arquivoIncendio ? {arquivoIncendio:a.arquivoIncendio} : {}),
          id, tipo,
          ...(tipo === "licitacao" ? { acompanhamento: acompanhar(it.acompanhamento === undefined ? a.acompanhamento : it.acompanhamento) } : {}),
          nome: String(it.nome).trim(),
          categoria: txt(it.categoria, a.categoria),
          identificacao: txt(it.identificacao, a.identificacao),
          responsavel: txt(it.responsavel, a.responsavel),
          emissao: it.emissao === undefined ? String(a.emissao ?? "") : String(it.emissao ?? ""),
          validade: it.validade === undefined ? String(a.validade ?? "") : String(it.validade ?? ""),
          medidorAtual: numOu(it.medidorAtual, a.medidorAtual),
          medidorProximo: numOu(it.medidorProximo, a.medidorProximo),
          unidadeMedidor: txt(it.unidadeMedidor, a.unidadeMedidor),
          observacao: txt(it.observacao, a.observacao),
          // Ficha tecnica por familia: placa/ano do carro, numero de serie da
          // maquina, local da camera. Objeto proprio para nao espalhar sete
          // campos vazios no shape que tambem serve documento e licitacao.
          especificacao: ['predial','informatica','seguranca'].includes(tipo)
            ? {...((a.especificacao as any)||{}),...limparEspec(tipo,it.especificacao,a.especificacao)}
            : limparEspec(tipo, it.especificacao, a.especificacao),
          // Campos das licitacoes (vazios nos demais tipos): numero do edital,
          // link do portal, hora da sessao, situacao e valor estimado.
          edital: txt(it.edital, a.edital),
          url: txt(it.url, a.url),
          hora: txt(it.hora, a.hora),
          status: txt(it.status, a.status),
          valor: numOu(it.valor, a.valor),
          // Apolices: `identificacao` ja e o numero da apolice, `responsavel` o
          // corretor, `emissao`/`validade` a vigencia e `valor` o premio anual.
          // Sobram dois campos proprios -- de quem e a apolice e quanto ela
          // cobre. Vazios nos demais tipos.
          seguradora: txt(it.seguradora, a.seguradora),
          valorSegurado: numOu(it.valorSegurado, a.valorSegurado),
          arquivoNome: txt(it.arquivoNome, a.arquivoNome),
          // Miniatura (data URL pequena) para a tela de Marketing nao precisar
          // baixar a logomarca INTEIRA -- ate 3 MB cada -- so para desenhar um
          // quadradinho de 96 px. Fica no proprio registro, entao vem junto com
          // a listagem, sem nenhuma ida extra ao servidor. O corte em 40 mil
          // caracteres (~30 KB) e o teto: acima disso nao e mais miniatura.
          miniatura: it.miniatura === undefined
            ? String(a.miniatura ?? "")
            : String(it.miniatura ?? "").slice(0, 40000),
          temArquivo: it.temArquivo === undefined ? !!a.temArquivo : !!it.temArquivo,
          atualizadoEm: agora,
          atualizadoPor: quem,
          criadoEm: ant?.registro?.criadoEm || agora,
        };

        if (FAMILIAS_EQUIPAMENTO.includes(tipo)) {
          if(['predial','informatica','seguranca'].includes(tipo)&&a.categoria&&it.categoria!==undefined&&it.categoria!==a.categoria)
            return resposta({erro:'Categoria física não pode mudar. Use a ficha do Patrimônio.'},409);
          Object.assign(limpo,validarVinculoPessoa(it,a,await pessoasRH(),'responsavel'));
          if (tipo==='veiculo') Object.assign(limpo.especificacao,validarVinculoPessoa(it.especificacao||{},a.especificacao,await pessoasRH(),'motorista'));
        }
        if(corpo.patrimonio) {
          exigeInventario(sessao);
          if(!sessao.master && !perms.includes('*') && !perms.includes('manutencoes')) return resposta({erro:'Sem acesso a Manutenções.'},403);
          const permitidos=['nomeGenerico','descricaoTecnica','observacao','setorSigla','nf','dataAquisicao','valor','situacao'];
          const patch=Object.fromEntries(Object.entries(corpo.patrimonio).filter(([k])=>permitidos.includes(k)));
          const {data:origens,error:falhaOrigem}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio').eq('registro->>origemAtivoId',id);
          if(falhaOrigem) throw falhaOrigem;
          const idsBem=[...new Set([corpo.bemId,a.bemId,...(origens||[]).map((r:any)=>r.id)].filter(Boolean))];
          if(idsBem.length>1) return resposta({erro:'Vínculos de inventário divergentes. Confira antes de salvar.'},409);
          const {data,error}=await sb.rpc('painel_equipamento_gravar',{p_id:id,p_ativo:limpo,p_anterior:ant?.registro || null,p_bem_id:idsBem[0] || crypto.randomUUID(),p_bem_patch:patch,p_por:quem});
          if(error) throw Object.assign(new Error(error.message),{code:error.code});
          return resposta({ok:true,item:ativoPermitido(data.item,sessao)});
        }
        const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:'ativo',p_id:id,p_registro:limpo,p_anterior:ant?.registro || null});
        if(error) throw Object.assign(new Error(error.message),{code:error.code});
        return resposta({ok:true,item:ativoPermitido(data,sessao)});
      }

      // Retirar mantém registro e arquivo recuperáveis na lixeira.
      case "remover": {
        const id = String(corpo.id ?? "");
        if (!id) return resposta({ erro: "id ausente" }, 400);
        { const b = await barraId(id); if (b) return b; }
        const tipoRemover = await tipoDoId(id);
        if (!tipoRemover) return resposta({ erro: "item nao encontrado" }, 404);
        { const b = await barraGravar(tipoRemover); if (b) return b; }
        if(corpo.bemId) exigeInventario(sessao);
        if(corpo.bemId && !sessao.master && !perms.includes('*') && !perms.includes('manutencoes')) return resposta({erro:'Sem acesso a Manutenções.'},403);
        const {error}=await sb.rpc('painel_ativo_retirar',{p_id:id,p_bem_id:corpo.bemId || null,p_por:quem});
        if(error) throw Object.assign(new Error(error.message),{code:error.code});
        return resposta({ ok: true, lixeira: true });
      }

      case "lixeira": {
        const { data } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo_lixeira").order("atualizado_em", { ascending: false });
        const itens = (data ?? []).map((r: any) => r.registro).filter((i: any) => podeTipo(i?.tipo));
        return resposta({ ok: true, itens:itens.map(i=>ativoPermitido(i,sessao)) });
      }

      case "restaurar": {
        const id = String(corpo.id ?? "");
        if (!id) return resposta({ erro: "id ausente" }, 400);
        const { data: lix, error: erroLix } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo_lixeira").eq("id", id).maybeSingle();
        if(erroLix)throw erroLix;
        if (!lix?.registro) return resposta({ erro: "nao esta na lixeira" }, 404);
        const reg = { ...(lix.registro as any) };
        delete reg._apagadoEm;
        { const b = await barraGravar(reg?.tipo); if (b) return b; }
        const {error}=await sb.rpc('painel_ativo_restaurar',{p_id:id,p_anterior:lix.registro});
        if(error)throw Object.assign(new Error(error.message),{code:error.code});
        return resposta({ ok: true });
      }

      case "guardarArquivo": {
        const id = String(corpo.id ?? "");
        const base64 = String(corpo.base64 ?? "");
        if (!id || !base64) return resposta({ erro: "id e base64 obrigatorios" }, 400);
        // O arquivo e anexo de alguem: sem item, ele fica no bucket sem nenhuma
        // tela que o liste, apague ou saiba que existe. Todas as telas cadastram
        // o item primeiro e so entao mandam o arquivo -- id sem item aqui e
        // sinal de que o cadastro falhou (ou de chamada torta).
        const tipoDono = await tipoDoId(id);
        if(tipoDono && FAMILIAS_EQUIPAMENTO.includes(tipoDono)) exigeInventario(sessao);
        if (!tipoDono) return resposta({ erro: "Cadastre o item antes de anexar o arquivo." }, 400);
        { const b = await barraGravar(tipoDono); if (b) return b; }
        if (base64.length > MAX_ARQUIVO) return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);

        const mime = String(corpo.mime ?? "application/pdf");
        const { error } = await sb.storage.from(BUCKET)
          .upload(id, b64ParaBytes(base64), { contentType: mime, upsert: true });
        if (error) throw new Error("upload: " + error.message);
        // mime+nome numa linha propria: o bucket guarda so os bytes, e a
        // listagem dos ativos continua leve (nao carrega megabytes de PDF).
        await sb.from("painel_registros").upsert(
          { colecao: "arquivo", id, registro: { mime, nome: String(corpo.nome ?? "documento") },
            atualizado_em: new Date().toISOString() },
          { onConflict: "colecao,id" });
        return resposta({ ok: true });
      }

      case "lerArquivo": {
        const id = String(corpo.id ?? "");
        { const b = await barraId(id); if (b) return b; }
        /* So arquivo DE ATIVO. O bucket e compartilhado com os anexos de
           conversa dos compromissos (que tem dono e regra propria no
           painel-config): sem esta trava, qualquer pessoa logada baixava o
           anexo da conversa de outra passando a chave dele aqui. */
        if (FAMILIAS_EQUIPAMENTO.includes(await tipoDoId(id) || '')) exigeInventario(sessao);
        if (!(await tipoDoId(id))) return resposta({ erro: "arquivo nao encontrado" }, 404);
        const { data: meta } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "arquivo").eq("id", id).maybeSingle();
        const { data: arq, error } = await sb.storage.from(BUCKET).download(id);
        if (error || !arq) return resposta({ erro: "arquivo nao encontrado" }, 404);
        // base64 PURO, sem prefixo data: -- o cliente faz atob() direto.
        return resposta({
          ok: true,
          base64: bytesParaB64(await arq.arrayBuffer()),
          mime: meta?.registro?.mime || arq.type || "application/pdf",
          nome: meta?.registro?.nome || "documento",
        });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-ativos] erro:", e);
    if ([403,422,503].includes((e as any)?.status)) return resposta({erro:(e as Error).message},(e as any).status);
    if ((e as any)?.code === "23503") return resposta({erro:"Este cadastro possui vínculos. Troque ou desvincule o setor, aparelho, gravador, contato técnico, unidade consumidora ou bem nas fichas relacionadas antes de retirar ou alterar."},409);
    if ((e as any)?.code === "23505") return resposta({erro:"Número, canal ou cadastro já utilizado. Confira os itens ativos antes de salvar ou restaurar; a lixeira foi preservada."},409);
    if ((e as any)?.code === "40001") return resposta({erro:"Este registro mudou durante a edição. Recarregue antes de salvar."},409);
    return resposta({ erro: "Não foi possível salvar a operação. Tente novamente." }, 500);
  }
});

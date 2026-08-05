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
// Permissao: documento/veiculo/maquina sao abertos a qualquer pessoa logada
// (dados operacionais da casa, como no original). Os tipos que chegaram
// depois -- marketing e licitacao -- exigem o modulo da tela deles, inclusive
// nas acoes por id, onde o tipo e lido do registro gravado.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const BUCKET = "painel-arquivos";
// "marketing" (logomarcas) e "licitacao" (editais) nao tem a mecanica de
// vencimento dos documentos, mas o esqueleto (item + arquivo anexo) e identico
// -- por isso vivem na mesma colecao, cada um com a sua tela.
const TIPOS = new Set(["documento", "veiculo", "maquina", "marketing", "licitacao"]);
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
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  const quem = sessao.nome || sessao.sub || "alguem";

  // Tres tipos moram nesta colecao mas pertencem a TELAS diferentes, com
  // permissoes diferentes. Sem esta amarra, uma conta com acesso so a
  // Orcamentos listava os editais e podia baixar e apagar arquivo deles --
  // o modulo existia so no menu.
  //
  // documento/veiculo/maquina ficam sem modulo de proposito: a tela
  // "Documentos e ativos" e aberta a qualquer pessoa logada (assim ja era).
  const MODULO_DO_TIPO: Record<string, string> = {
    marketing: "marketing",
    licitacao: "licitacoes",
  };
  const perms: string[] = Array.isArray(sessao.perms) ? sessao.perms : [];
  const podeTipo = (tipo: string) => {
    const mod = MODULO_DO_TIPO[tipo];
    if (!mod) return true;
    return sessao.master === true || perms.includes("*") || perms.includes(mod);
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

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  try {
    switch (corpo.action) {
      case "listar": {
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
        return resposta({ ok: true, itens: itens.filter((i: any) => podeTipo(i?.tipo)) });
      }

      case "salvar": {
        const it = corpo.item ?? {};
        const tipo = String(it.tipo ?? "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        if (!podeTipo(tipo)) return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
        if (!String(it.nome ?? "").trim()) return resposta({ erro: "informe o nome" }, 400);

        const agora = new Date().toISOString();
        const id = it.id || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { data: ant } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo").eq("id", id).maybeSingle();

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

        const tipoGravado = (ant?.registro as any)?.tipo;
        if (tipoGravado) {
          if (!podeTipo(tipoGravado)) {
            return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
          }
          if (tipoGravado !== tipo) {
            return resposta({ erro: "Nao da para mudar o tipo de um item ja cadastrado." }, 400);
          }
        }

        const limpo = {
          id, tipo,
          nome: String(it.nome).trim(),
          categoria: String(it.categoria ?? "").trim(),
          identificacao: String(it.identificacao ?? "").trim(),
          responsavel: String(it.responsavel ?? "").trim(),
          emissao: String(it.emissao ?? ""),
          validade: String(it.validade ?? ""),
          medidorAtual: Number(it.medidorAtual) || 0,
          medidorProximo: Number(it.medidorProximo) || 0,
          unidadeMedidor: String(it.unidadeMedidor ?? "").trim(),
          observacao: String(it.observacao ?? "").trim(),
          // Campos das licitacoes (vazios nos demais tipos): numero do edital,
          // link do portal, hora da sessao, situacao e valor estimado.
          edital: String(it.edital ?? "").trim(),
          url: String(it.url ?? "").trim(),
          hora: String(it.hora ?? "").trim(),
          status: String(it.status ?? "").trim(),
          valor: Number(it.valor) || 0,
          arquivoNome: String(it.arquivoNome ?? "").trim(),
          // Miniatura (data URL pequena) para a tela de Marketing nao precisar
          // baixar a logomarca INTEIRA -- ate 3 MB cada -- so para desenhar um
          // quadradinho de 96 px. Fica no proprio registro, entao vem junto com
          // a listagem, sem nenhuma ida extra ao servidor. O corte em 40 mil
          // caracteres (~30 KB) e o teto: acima disso nao e mais miniatura.
          miniatura: String(it.miniatura ?? "").slice(0, 40000),
          temArquivo: !!it.temArquivo,
          atualizadoEm: agora,
          atualizadoPor: quem,
          criadoEm: ant?.registro?.criadoEm || agora,
        };

        // Uma linha por item: dois cadastros simultaneos nunca se apagam.
        const { error } = await sb.from("painel_registros").upsert(
          { colecao: "ativo", id, registro: limpo, atualizado_em: agora },
          { onConflict: "colecao,id" });
        if (error) throw new Error(error.message);
        return resposta({ ok: true, item: limpo });
      }

      case "remover": {
        const id = String(corpo.id ?? "");
        if (!id) return resposta({ erro: "id ausente" }, 400);
        { const b = await barraId(id); if (b) return b; }
        await sb.from("painel_registros").delete().eq("colecao", "ativo").eq("id", id);
        // O arquivo vai junto: deixar orfao so ocupa espaco e guarda um
        // documento que o usuario mandou apagar.
        await sb.from("painel_registros").delete().eq("colecao", "arquivo").eq("id", id);
        await sb.storage.from(BUCKET).remove([id]).catch(() => {});
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
        if (!tipoDono) return resposta({ erro: "Cadastre o item antes de anexar o arquivo." }, 400);
        if (!podeTipo(tipoDono)) return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
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
    return resposta({ erro: "erro interno" }, 500);
  }
});

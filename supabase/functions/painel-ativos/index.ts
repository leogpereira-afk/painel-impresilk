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
// Permissao: qualquer pessoa logada le e escreve -- sao dados operacionais da
// casa (nao financeiros), fora da lista de modulos. Igual ao original.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const BUCKET = "painel-arquivos";
const TIPOS = new Set(["documento", "veiculo", "maquina"]);
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
        return resposta({ ok: true, itens });
      }

      case "salvar": {
        const it = corpo.item ?? {};
        const tipo = String(it.tipo ?? "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        if (!String(it.nome ?? "").trim()) return resposta({ erro: "informe o nome" }, 400);

        const agora = new Date().toISOString();
        const id = it.id || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { data: ant } = await sb.from("painel_registros").select("registro")
          .eq("colecao", "ativo").eq("id", id).maybeSingle();

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
          arquivoNome: String(it.arquivoNome ?? "").trim(),
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

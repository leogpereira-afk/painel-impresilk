// Documentos, veiculos e maquinas da Impresilk.
//
// Os tres sao o MESMO problema: uma coisa que tem data e alguem precisa agir
// antes dela passar. Um alvara vencido para a empresa; um IPVA vencido para o
// carro; uma revisao vencida quebra a maquina no meio da producao. Por isso um
// so motor com tres tipos, em vez de tres modulos parecidos que divergem com o
// tempo.
//
// Guarda no Blobs (store "painel"), UM BLOB POR ITEM:
//   ativo_<id>      -> o item
//   arquivo_<id>    -> o PDF/imagem em base64
//
// Por que um blob por item, e nao uma lista unica: com lista unica, salvar e
// ler-alterar-gravar. Duas pessoas cadastrando ao mesmo tempo leem a mesma
// lista e a segunda gravacao apaga a primeira -- perda SILENCIOSA. Aconteceu no
// primeiro teste desta funcao: dois cadastros seguidos e so um sobreviveu. A
// versao 8 do @netlify/blobs nao tem escrita condicional, entao a saida e nao
// compartilhar a chave: cada item so escreve na sua.
//
// O arquivo fica em chave separada porque a listagem precisa ser leve e um
// cartao CNPJ digitalizado tem megabytes.

import { getStore, connectLambda } from "@netlify/blobs";
import { exigirSessao } from "./lib/guarda.js";

const PREFIXO = "ativo_";
const TIPOS = new Set(["documento", "veiculo", "maquina"]);
const MAX_ARQUIVO = 4 * 1024 * 1024; // 4 MB em base64 (~3 MB de arquivo)

const resposta = (body, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  if (event.httpMethod !== "POST") return resposta({ erro: "use POST" }, 405);

  // Qualquer pessoa logada le e escreve: sao dados operacionais da casa (nao
  // financeiros). O modulo nao entra na lista de permissoes por isso.
  const guarda = await exigirSessao(event);
  if (guarda.resposta) return guarda.resposta;
  const quem = guarda.sessao?.nome || guarda.sessao?.sub || "alguem";

  let corpo = {};
  try {
    corpo = JSON.parse(event.body || "{}");
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  const store = getStore("painel");

  // Le todos os itens. store.list() tem consistencia eventual (~1 min) para
  // chaves NOVAS, entao quem acabou de cadastrar pode nao ver na lista de
  // imediato -- por isso a tela adiciona o item devolvido pelo salvar ao seu
  // estado local em vez de esperar a listagem.
  const lerLista = async () => {
    const { blobs } = await store.list({ prefix: PREFIXO });
    const itens = await Promise.all(
      (blobs || []).map((b) => store.get(b.key, { type: "json" }).catch(() => null))
    );
    return itens.filter(Boolean);
  };

  try {
    switch (corpo.action) {
      case "listar":
        return resposta({ ok: true, itens: await lerLista() });

      case "salvar": {
        const it = corpo.item || {};
        const tipo = String(it.tipo || "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        if (!String(it.nome || "").trim()) return resposta({ erro: "informe o nome" }, 400);

        const agora = new Date().toISOString();
        const id = it.id || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const anterior = await store.get(PREFIXO + id, { type: "json" }).catch(() => null);
        const limpo = {
          id,
          tipo,
          nome: String(it.nome).trim(),
          categoria: String(it.categoria || "").trim(),
          identificacao: String(it.identificacao || "").trim(), // numero do doc, placa, patrimonio
          responsavel: String(it.responsavel || "").trim(),
          emissao: String(it.emissao || ""),
          validade: String(it.validade || ""),
          // Manutencao por uso (veiculo/maquina): a proxima pode vir por data OU
          // por quilometragem/horas. Guardamos os dois; a tela avisa pelo que
          // chegar primeiro.
          medidorAtual: Number(it.medidorAtual) || 0,
          medidorProximo: Number(it.medidorProximo) || 0,
          unidadeMedidor: String(it.unidadeMedidor || "").trim(), // km | horas
          observacao: String(it.observacao || "").trim(),
          arquivoNome: String(it.arquivoNome || "").trim(),
          temArquivo: !!it.temArquivo,
          atualizadoEm: agora,
          atualizadoPor: quem,
        };

        limpo.criadoEm = anterior?.criadoEm || agora;
        // Escreve SO na chave deste item: nao ha leitura-alteracao-gravacao de
        // uma estrutura compartilhada, entao nao ha como um cadastro apagar o
        // outro.
        await store.setJSON(PREFIXO + id, limpo);
        return resposta({ ok: true, item: limpo });
      }

      case "remover": {
        const id = String(corpo.id || "");
        if (!id) return resposta({ erro: "id ausente" }, 400);
        await store.delete(PREFIXO + id).catch(() => {});
        // O arquivo vai junto: deixar o blob orfao so ocupa espaco e guarda um
        // documento que o usuario mandou apagar.
        await store.delete(`arquivo_${id}`).catch(() => {});
        return resposta({ ok: true });
      }

      case "guardarArquivo": {
        const id = String(corpo.id || "");
        const base64 = String(corpo.base64 || "");
        if (!id || !base64) return resposta({ erro: "id e base64 obrigatorios" }, 400);
        if (base64.length > MAX_ARQUIVO) {
          return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);
        }
        await store.setJSON(`arquivo_${id}`, {
          base64,
          mime: String(corpo.mime || "application/pdf"),
          nome: String(corpo.nome || "documento"),
        });
        return resposta({ ok: true });
      }

      case "lerArquivo": {
        const id = String(corpo.id || "");
        const arq = await store.get(`arquivo_${id}`, { type: "json" }).catch(() => null);
        if (!arq) return resposta({ erro: "arquivo nao encontrado" }, 404);
        return resposta({ ok: true, ...arq });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("ativos:", e?.message || e);
    return resposta({ erro: "erro interno" }, 500);
  }
};

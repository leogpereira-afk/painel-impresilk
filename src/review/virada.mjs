// Dados inteiramente fictícios. Este módulo só entra no build de revisão.
import {
  ErroVirada, MAX_FOTO, aplicarAcao, arquivoAutorizado, apresentarCiclo,
  atorDoCiclo, autorizarModulo, validarFoto, validarPdf, documentoPdiAutorizado,
} from '../../supabase/functions/_shared/virada.mjs';
import { MODELOS_MISSAO } from '../lib/virada.mjs';

const CHAVE = 'impresilk-a-virada-review-v1';
const pessoas = [
  { id: 'review-direcao', nome: 'Direção Exemplo', funcao: 'Direção · demonstração' },
  { id: 'review-lider', nome: 'Ana Exemplo', funcao: 'Liderança comercial · demonstração' },
  { id: 'review-mentor', nome: 'Bruno Exemplo', funcao: 'Gestão de produção · demonstração' },
  { id: 'review-carla', nome: 'Carla Exemplo', funcao: 'Referência técnica · demonstração' },
];
const idCiclo = '10000000-0000-4000-8000-000000000001';
const idsParticipantes = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'];
let memoria;

function exemploInicial() {
  const em = new Date().toISOString();
  const autor = { usuario: 'review-direcao', nome: 'Direção Exemplo', rhId: 'review-direcao' };
  const modelos = ['briefing_conferido', 'capacidade_integrada', 'ensino_verificado'];
  return {
    formato: 1,
    arquivos: {},
    ciclo: {
      id: idCiclo, nome: 'A Virada · demonstração fictícia', inicio: null, dias: 90, versao: 1,
      participantes: pessoas.slice(1).map((p, i) => ({ id: idsParticipantes[i], rhId: p.id, nome: p.nome, funcao: p.funcao, mentorId: i === 0 ? idsParticipantes[1] : null })),
      missoes: modelos.map((id, i) => {
        const m = MODELOS_MISSAO.find(x => x.id === id);
        return { id: `30000000-0000-4000-8000-00000000000${i + 1}`, participanteId: idsParticipantes[i], titulo: `${m.titulo} · exemplo`, objetivo: m.objetivo, criterio: m.criterio, tipo: m.tipo, fase: m.fase, prazo: null, status: 'planejada', evidencias: [], comentarios: [], historico: [], criadoEm: em, criadoPor: autor };
      }),
      mural: [], historico: [], atualizadoEm: em,
    },
  };
}

function carregar() {
  try {
    const salvo = JSON.parse(globalThis.localStorage?.getItem(CHAVE) || 'null');
    if (salvo?.formato === 1 && salvo.ciclo?.id && Array.isArray(salvo.ciclo?.missoes) && salvo.arquivos) return salvo;
  } catch { /* A prévia pode começar de novo se o armazenamento não estiver disponível. */ }
  memoria ||= exemploInicial();
  return memoria;
}

function gravar(estado) {
  try {
    globalThis.localStorage?.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    throw new ErroVirada('O armazenamento desta demonstração está cheio ou indisponível. Use uma foto menor ou reinicie a demonstração.', 413);
  }
  memoria = estado;
}

function perfil(url) {
  const origem = globalThis.location?.origin || 'https://review.invalid';
  const query = new URL(url, origem).searchParams;
  const navegador = new URLSearchParams(globalThis.location?.search || '');
  const p = query.get('perfil') || navegador.get('perfil');
  if (p === 'virada-sem-acesso') return { sessao: { sub: 'review-externo', nome: 'Conta sem acesso · simulação', master: false, perms: [] }, identidade: { rhId: null } };
  const rhId = p === 'virada-lider' ? 'review-lider' : p === 'virada-mentor' ? 'review-mentor' : 'review-direcao';
  const pessoa = pessoas.find(x => x.id === rhId);
  return { sessao: { sub: rhId, nome: pessoa.nome, master: rhId === 'review-direcao', perms: ['virada'] }, identidade: { rhId } };
}

function apresentar(estado, sessao, identidade) {
  const ator = atorDoCiclo(estado.ciclo, sessao, identidade);
  return { ciclo: apresentarCiclo(estado.ciclo, ator), ator, podeConfigurar: ator.direcao, demonstracao: true };
}

const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });

/** Mesmo contrato de painel-virada; fotos ficam apenas no armazenamento da prévia. */
export async function respostaVirada(url, opts = {}) {
  try {
    let b;
    try { b = opts.body ? JSON.parse(opts.body) : { action: 'listar' }; }
    catch { throw new ErroVirada('Pedido JSON inválido.', 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ErroVirada('Pedido inválido.', 400);
    const { sessao, identidade } = perfil(url);
    autorizarModulo(sessao);
    const estado = carregar();
    const ator = atorDoCiclo(estado.ciclo, sessao, identidade);
    if (b.action === 'listar') return resposta({ ok: true, ...apresentar(estado, sessao, identidade) });
    if (b.action === 'pessoas') {
      if (!ator.direcao) throw new ErroVirada('Somente a direção configura o programa.', 403);
      return resposta({ ok: true, pessoas });
    }
    if (b.action === 'reiniciarDemo') {
      if (!ator.direcao) throw new ErroVirada('Somente a direção reinicia a demonstração.', 403);
      const novo = exemploInicial(); gravar(novo);
      return resposta({ ok: true, ...apresentar(novo, sessao, identidade) });
    }
    if (b.action === 'documentoPdi') {
      if (b.idCiclo !== estado.ciclo.id) throw new ErroVirada('Ciclo não encontrado.',404);
      const f = documentoPdiAutorizado(estado.ciclo,b,ator);
      const conteudo = estado.arquivos[f.chave];
      if (!conteudo) throw new ErroVirada('Documento indisponível nesta prévia.',404);
      return resposta({ok:true,url:conteudo,nome:f.nome});
    }
    if (b.action === 'anexarPdi') {
      if (!ator.direcao) throw new ErroVirada('Somente a direção publica o PDI.',403);
      if (typeof b.base64 !== 'string' || b.base64.length > Math.ceil(MAX_FOTO/3)*4) throw new ErroVirada('PDF inválido.');
      let bytes;try{bytes=Uint8Array.from(atob(b.base64),x=>x.charCodeAt(0));}catch{throw new ErroVirada('PDF inválido.');}
      const tipo=validarPdf(b.nome,b.mime,bytes),id=crypto.randomUUID(),chave=`virada/${estado.ciclo.id}/pdis/${b.participanteId}/${id}.pdf`;
      const documento={id,chave,...tipo};
      const ciclo=aplicarAcao(estado.ciclo,b,sessao,identidade,{documento});
      const novo={...estado,ciclo,arquivos:{...estado.arquivos,[chave]:`data:application/pdf;base64,${b.base64}`}};
      gravar(novo);return resposta({ok:true,...apresentar(novo,sessao,identidade)});
    }
    if (b.action === 'foto') {
      if (b.idCiclo !== estado.ciclo?.id) throw new ErroVirada('Ciclo não encontrado.', 404);
      const arquivo = arquivoAutorizado(estado.ciclo, b, ator);
      const conteudo = estado.arquivos[arquivo.id];
      if (!conteudo) throw new ErroVirada('Foto de demonstração indisponível. Anexe novamente.', 410);
      return resposta({ ok: true, url: conteudo, demonstracao: true });
    }

    let arquivo, dataUrl;
    if (b.action === 'anexar') {
      if (typeof b.base64 !== 'string' || !b.base64 || b.base64.length > Math.ceil(MAX_FOTO / 3) * 4 || b.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64)) throw new ErroVirada('Foto inválida ou acima de 6 MiB.');
      let bytes;
      try { bytes = Uint8Array.from(atob(b.base64), c => c.charCodeAt(0)); }
      catch { throw new ErroVirada('Conteúdo da foto inválido.'); }
      const validado = validarFoto(b.nome, b.mime, bytes);
      const id = crypto.randomUUID();
      arquivo = { ...validado, id, chave: `virada/${estado.ciclo?.id}/${b.missaoId}/${id}.${validado.ext}` };
      dataUrl = `data:${validado.mime};base64,${b.base64}`;
    }
    const ciclo = aplicarAcao(estado.ciclo, b, sessao, identidade, { pessoas, arquivo });
    const novo = { ...estado, ciclo, arquivos: { ...estado.arquivos } };
    if (arquivo) novo.arquivos[arquivo.id] = dataUrl;
    // Publica a alteração somente depois de a gravação completa ter funcionado.
    gravar(novo);
    return resposta({ ok: true, ...apresentar(novo, sessao, identidade) });
  } catch (e) {
    return resposta({ ok: false, erro: e.message || 'Não foi possível concluir a ação.' }, e.status || 422);
  }
}

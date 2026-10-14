// Vínculo entre o bem do inventário (coleção `patrimonio`) e a ficha de
// equipamento de cima (coleção `ativo`): carro, máquina, estrutura, celulares
// e ramais, segurança e prevenção contra incêndio.
//
// FONTE ÚNICA: todo vínculo novo vive só na ficha (`ativo.bemId`), numa
// gravação conferida pela regra adiada painel_ativo_bem_direto_integro.
// `bem.origemAtivoId` fica como legado e como espelho que Carros e Máquinas
// (painel_equipamento_gravar) continuam gravando. O bem enxerga a ficha na
// leitura. Desfazer limpa os dois lados, o bem primeiro.
//
// Módulo puro: sem banco e sem importar patrimonio-acesso.mjs, que re-exporta
// este com `export *` (assim os testes que injetam o acesso no vm recebem
// estes nomes também). Espelhado em src/lib/calc/vinculo-patrimonio.js:
// familiaVinculo, fichaAceitaBem, fichaBaixada, moduloDoVinculo,
// ROTULO_FAMILIA_VINCULO e ROTULO_MODULO_VINCULO têm de dar o mesmo resultado
// nos dois lados. Mexeu aqui, mexe lá.

export const CATEGORIAS_INCENDIO_VINCULO = ['Extintor', 'AVCB', 'Iluminação de emergência', 'Sinalização de segurança'];
export const CATEGORIAS_TELEFONIA_VINCULO = ['Telefone', 'Central telefônica', 'Celular'];

export const ROTULO_FAMILIA_VINCULO = {
  carro: 'Carro', maquina: 'Máquina', estrutura: 'Estrutura',
  telefonia: 'Celulares e Ramais', seguranca: 'Segurança', incendio: 'Prevenção contra incêndio',
};
export const ROTULO_MODULO_VINCULO = {
  manutencoes: 'Patrimônio · Manutenções', seguranca: 'Segurança', patrimonio: 'Patrimônio',
};
// A permissão que hoje liga cada tipo pela própria ficha, sempre somada a
// Inventário e valores. Com Patrimônio, Inventário e valores, Patrimônio ·
// Manutenções e Segurança, a pessoa passa nas seis famílias.
const MODULO_DA_FAMILIA = {
  carro: 'manutencoes', maquina: 'manutencoes', estrutura: 'patrimonio',
  telefonia: 'patrimonio', seguranca: 'seguranca', incendio: 'patrimonio',
};
export const MAX_EVENTOS_VINCULO = 200;

export function familiaVinculo(ficha) {
  switch (ficha?.tipo) {
    case 'veiculo': return 'carro';
    case 'maquina': return 'maquina';
    case 'seguranca': return 'seguranca';
    case 'predial': return CATEGORIAS_INCENDIO_VINCULO.includes(ficha.categoria) ? 'incendio' : 'estrutura';
    case 'informatica': return CATEGORIAS_TELEFONIA_VINCULO.includes(ficha.categoria) ? 'telefonia' : 'estrutura';
    default: return null;
  }
}
// O AVCB é documento, não equipamento: não se liga a bem.
export function fichaAceitaBem(ficha) {
  return familiaVinculo(ficha) !== null && !(ficha.tipo === 'predial' && ficha.categoria === 'AVCB');
}
// Carro, máquina e itens antigos da Estrutura não têm situação: nunca baixados.
export function fichaBaixada(ficha) {
  return ficha?.especificacao?.situacao === 'baixado';
}
export function moduloDoVinculo(ficha) {
  return MODULO_DA_FAMILIA[familiaVinculo(ficha)] ?? null;
}

// Mesma régua de temPermissao, repetida para não criar ciclo de import.
function tem(sessao, modulo) {
  return !!sessao && (sessao.master === true || sessao.perms?.includes('*') || sessao.perms?.includes(modulo)) === true;
}
export function podeMexerNoVinculo(sessao, ficha) {
  if (sessao?.master === true || sessao?.perms?.includes('*')) return true;
  const modulo = moduloDoVinculo(ficha);
  return !!modulo && tem(sessao, 'inventario-valores') && tem(sessao, modulo);
}
export function mensagemSemPermissaoVinculo(ficha) {
  const familia = familiaVinculo(ficha);
  if (!familia) return MSG_VINCULO.fichaNaoLiga;
  return `Ligar ou desfazer vínculo de ${ROTULO_FAMILIA_VINCULO[familia]} exige a permissão ${ROTULO_MODULO_VINCULO[MODULO_DA_FAMILIA[familia]]}.`;
}

const texto = (valor, max = 180) =>
  typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor)) ? String(valor).trim().slice(0, max) : '';

// {Família} · {nome}; a ficha de Segurança nunca se mostra a quem não tem a
// permissão; ficha na lixeira ou sumida vira "uma ficha retirada".
export function rotuloFichaVinculo(ficha, sessao, { retirada = false } = {}) {
  if (!ficha || retirada) return 'uma ficha retirada';
  const familia = familiaVinculo(ficha);
  if (familia === 'seguranca' && !tem(sessao, 'seguranca')) return 'uma ficha de Segurança';
  return `${ROTULO_FAMILIA_VINCULO[familia] || 'Ficha'} · ${texto(ficha.nome) || 'Sem nome'}`;
}
// Etiqueta ou nome do bem, para as mensagens.
export function rotuloBemVinculo(bem, bemId = '') {
  return texto(bem?.codigo, 60) || texto(bem?.nomeGenerico) || texto(bem?.nome) || texto(bemId) || 'sem etiqueta';
}

// Evento do histórico do vínculo, igual na ficha (historicoVinculo) e no bem
// (historico). O id nasce aqui, e não no index.ts: o vm de alguns testes não
// tem `crypto`, e o mesmo id nos dois registros evita repetir na leitura.
export function eventoVinculo({ acao, ficha, ativoId, bemId, bemCodigo = '', sessao, via, lado, tela, motivo, agora }) {
  return {
    id: globalThis.crypto.randomUUID(),
    acao,
    bemId: texto(bemId),
    ativoId: texto(ativoId ?? ficha?.id),
    familia: familiaVinculo(ficha) || '',
    nome: texto(ficha?.nome),
    bemCodigo: texto(bemCodigo, 60),
    lado,
    via,
    ...(tela === 'bem' || tela === 'ficha' ? { tela } : {}),
    ...(motivo ? { motivo: texto(motivo, 300) } : {}),
    por: texto(sessao?.sub),
    porNome: texto(sessao?.nome) || texto(sessao?.sub),
    em: agora || new Date().toISOString(),
  };
}
// O login (`por`) nunca desce para a tela.
export function eventoPublicoVinculo(evento) {
  if (!evento || typeof evento !== 'object') return null;
  const { por: _login, ...publico } = evento;
  return publico;
}
export function comEventoVinculo(lista, evento) {
  return [...(Array.isArray(lista) ? lista : []), evento].slice(-MAX_EVENTOS_VINCULO);
}

// Textos exatos do contrato com a tela (PLANO-VINCULO.md, seção 3.6).
export const MSG_VINCULO = {
  idInvalido: 'Identificador inválido. Atualize a página.',
  versaoInvalida: 'Versão inválida. Atualize a página.',
  semInventario: 'Esta operação exige Inventário e valores.',
  semPermissaoFamilia: ficha => mensagemSemPermissaoVinculo(ficha),
  fichaNaoEncontrada: 'Ficha não encontrada. Atualize a lista.',
  fichaRetirada: 'Esta ficha foi retirada. Atualize a lista.',
  fichaNaoLiga: 'Este cadastro não se liga a bem do inventário.',
  fichaBaixada: 'Esta ficha está baixada e não pode ser ligada.',
  fichaMudou: 'Esta ficha mudou. Atualize antes de continuar.',
  bemNaoEncontrado: 'Bem não encontrado. Atualize a lista.',
  bemExcluido: 'Este bem foi excluído. Atualize a lista.',
  bemBaixado: 'Este bem está baixado e não pode ser ligado.',
  bemMudou: 'Este bem mudou. Atualize antes de continuar.',
  fichaJaLigada: bem => `Esta ficha já está ligada ao bem ${bem}. Desfaça esse vínculo antes de ligar outro.`,
  bemJaLigado: rotulo => `Este bem já está ligado a ${rotulo}. Desfaça esse vínculo antes de ligar de novo.`,
  outroBemNaFicha: bem => `Esta ficha também aparece ligada ao bem ${bem}. Desfaça esse vínculo primeiro.`,
  corrida: 'O bem ou a ficha mudou durante o vínculo. Atualize e tente de novo.',
  parcial: 'O vínculo foi desfeito só no bem. Atualize a ficha do bem e use Desfazer de novo.',
  trocaPeloFormulario: 'Esta ficha já está ligada a um bem. Para trocar ou tirar, use Desfazer vínculo e depois ligue de novo.',
  excluirLigado: rotulo => `Este bem está ligado a ${rotulo}. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.`,
  removerVinculoMudou: 'O vínculo deste equipamento mudou. Atualize a lista antes de retirar.',
  cmVersao: 'Esta ficha mudou. Recarregue antes de salvar.',
};
export const STATUS_VINCULO = {
  idInvalido: 422, versaoInvalida: 422, semInventario: 403, semPermissaoFamilia: 403,
  fichaNaoEncontrada: 404, fichaRetirada: 409, fichaNaoLiga: 422, fichaBaixada: 409, fichaMudou: 409,
  bemNaoEncontrado: 404, bemExcluido: 409, bemBaixado: 409, bemMudou: 409,
  fichaJaLigada: 409, bemJaLigado: 409, outroBemNaFicha: 409, corrida: 409, parcial: 500,
  trocaPeloFormulario: 409, excluirLigado: 409, removerVinculoMudou: 409, cmVersao: 409,
};
// Recusas do próprio vínculo (o bem ou a ficha não podem ser ligados). Vêm com
// `recusaVinculo: true` para o formulário da ficha mostrar o motivo sem travar
// como se outra pessoa tivesse gravado; versão velha e corrida não levam a marca.
const RECUSAS_VINCULO = new Set(['trocaPeloFormulario', 'fichaNaoLiga', 'fichaBaixada', 'bemNaoEncontrado', 'bemExcluido',
  'bemBaixado', 'fichaJaLigada', 'bemJaLigado', 'outroBemNaFicha']);
// {erro, status} pronto para a resposta; o 500 parcial leva `parcial: true`.
export function erroVinculo(codigo, ...args) {
  const msg = MSG_VINCULO[codigo];
  const corpo = { erro: typeof msg === 'function' ? msg(...args) : msg };
  if (codigo === 'parcial') corpo.parcial = true;
  if (RECUSAS_VINCULO.has(codigo)) corpo.recusaVinculo = true;
  return { corpo, status: STATUS_VINCULO[codigo] ?? 409 };
}

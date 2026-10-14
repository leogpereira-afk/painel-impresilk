// Vínculo entre o bem do inventário e a ficha de cima (Carro, Máquina,
// Estrutura, Celulares e Ramais, Segurança, Prevenção contra incêndio).
//
// As seis primeiras exportações são o espelho de
// supabase/functions/_shared/patrimonio-vinculo.mjs: mesmos nomes, mesmos
// resultados (tests/vinculo-tela-paridade.test.mjs confere). Só IDs ligam:
// a ficha guarda `bemId` (fonte de todo vínculo novo) e o bem antigo pode
// guardar `origemAtivoId` (legado e espelho de Carros e Máquinas).
const texto = valor => String(valor ?? '').trim();

export const CATEGORIAS_INCENDIO_VINCULO = ['Extintor', 'AVCB', 'Iluminação de emergência', 'Sinalização de segurança'];
export const CATEGORIAS_TELEFONIA_VINCULO = ['Telefone', 'Central telefônica', 'Celular'];
export const ROTULO_FAMILIA_VINCULO = {
  carro: 'Carro', maquina: 'Máquina', estrutura: 'Estrutura',
  telefonia: 'Celulares e Ramais', seguranca: 'Segurança', incendio: 'Prevenção contra incêndio',
};
export const ROTULO_MODULO_VINCULO = { manutencoes: 'Patrimônio · Manutenções', seguranca: 'Segurança', patrimonio: 'Patrimônio' };
const MODULO_DA_FAMILIA = { carro: 'manutencoes', maquina: 'manutencoes', estrutura: 'patrimonio', telefonia: 'patrimonio', seguranca: 'seguranca', incendio: 'patrimonio' };

export function familiaVinculo(ficha) {
  const tipo = ficha?.tipo, categoria = ficha?.categoria;
  if (tipo === 'veiculo') return 'carro';
  if (tipo === 'maquina') return 'maquina';
  if (tipo === 'seguranca') return 'seguranca';
  if (tipo === 'predial') return CATEGORIAS_INCENDIO_VINCULO.includes(categoria) ? 'incendio' : 'estrutura';
  if (tipo === 'informatica') return CATEGORIAS_TELEFONIA_VINCULO.includes(categoria) ? 'telefonia' : 'estrutura';
  return null;
}
// O AVCB é documento, não equipamento: nunca recebe bem.
export function fichaAceitaBem(ficha) {
  return familiaVinculo(ficha) !== null && !(ficha.tipo === 'predial' && ficha.categoria === 'AVCB');
}
export function fichaBaixada(ficha) {
  return ficha?.especificacao?.situacao === 'baixado';
}
export function moduloDoVinculo(ficha) {
  const familia = familiaVinculo(ficha);
  return familia ? MODULO_DA_FAMILIA[familia] : null;
}

// Daqui para baixo, só a tela.
export const FAMILIAS_VINCULO = [
  { id: 'carro', rotulo: 'Carro', aba: 'Carros' },
  { id: 'maquina', rotulo: 'Máquina', aba: 'Máquinas' },
  { id: 'estrutura', rotulo: 'Estrutura', aba: 'Estrutura' },
  { id: 'telefonia', rotulo: 'Celulares e Ramais', aba: 'Celulares e Ramais' },
  { id: 'seguranca', rotulo: 'Segurança', aba: 'Segurança' },
  { id: 'incendio', rotulo: 'Prevenção contra incêndio', aba: 'Prevenção contra incêndio' },
];

// `pode` é o podeAbrir da sessão (master e * passam em tudo).
export function podeVincularFamilia(familia, pode) {
  const modulo = MODULO_DA_FAMILIA[familia];
  return !!modulo && pode('inventario-valores') && pode(modulo);
}

function unicas(fichas = []) {
  const vistas = new Set();
  return (fichas || []).filter(f => {
    if (!f?.id || vistas.has(f.id)) return false;
    vistas.add(f.id);
    return true;
  });
}

// Estado do vínculo visto por cada bem. Lados vazios não discordam: ligado
// só pela ficha (o normal daqui para a frente) e legado só pelo bem são
// "ligado". Só "a-conferir" vira pendência.
export function vinculosDosBens(bens = [], fichas = [], ocultos = []) {
  const lista = unicas(fichas);
  const porId = new Map(lista.map(f => [f.id, f]));
  const ocultas = new Map((ocultos || []).filter(o => o?.ativoId && !porId.has(o.ativoId)).map(o => [o.ativoId, texto(o.bemId)]));
  const resultado = {};
  for (const bem of bens || []) {
    if (!bem?.id) continue;
    const origem = texto(bem.origemAtivoId);
    const ligacoes = [];
    for (const ficha of lista) if (texto(ficha.bemId) === bem.id) ligacoes.push({ ativoId: ficha.id, ficha, lado: origem === ficha.id ? 'ambos' : 'ficha', oculta: false });
    for (const [ativoId, bemId] of ocultas) if (bemId === bem.id) ligacoes.push({ ativoId, ficha: null, lado: origem === ativoId ? 'ambos' : 'ficha', oculta: true });
    let fichaDaOrigem = null, origemOculta = false, origemRetirada = false, origemEmOutroBem = false;
    if (origem && !ligacoes.some(l => l.ativoId === origem)) {
      fichaDaOrigem = porId.get(origem) || null;
      origemOculta = !fichaDaOrigem && ocultas.has(origem);
      origemRetirada = !fichaDaOrigem && !origemOculta;
      const bemDaOrigem = fichaDaOrigem ? texto(fichaDaOrigem.bemId) : origemOculta ? ocultas.get(origem) : '';
      origemEmOutroBem = !!bemDaOrigem && bemDaOrigem !== bem.id;
      ligacoes.push({ ativoId: origem, ficha: fichaDaOrigem, lado: 'bem', oculta: origemOculta });
    }
    const diretas = ligacoes.filter(l => l.lado !== 'bem');
    let estado = 'ligado', motivo = '';
    if (!ligacoes.length) estado = 'sem-ficha';
    else if (diretas.length > 1 || (diretas.length === 1 && ligacoes.length > 1) || origemEmOutroBem) { estado = 'a-conferir'; motivo = 'conflito'; }
    else if (origemRetirada) { estado = 'a-conferir'; motivo = 'ficha-retirada'; }
    const unica = estado === 'ligado' ? ligacoes[0] : null;
    resultado[bem.id] = { estado, motivo, ficha: unica?.ficha || null, oculta: !!unica?.oculta, ligacoes };
  }
  return resultado;
}

// Fichas que o bem pode escolher: da família, que aceitam bem, não baixadas
// e livres dos dois lados (sem bemId e sem bem apontando para elas).
export function fichasLivresParaBem(fichas = [], bens = [], familia = '') {
  const comOrigem = new Set((bens || []).map(b => texto(b?.origemAtivoId)).filter(Boolean));
  return unicas(fichas).filter(f => familiaVinculo(f) === familia && fichaAceitaBem(f) && !fichaBaixada(f)
    && !texto(f.bemId) && !comOrigem.has(f.id))
    .sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), 'pt-BR', { numeric: true }) || a.id.localeCompare(b.id));
}

const LIMITE_ROTULO = 60;
function complemento(ficha) {
  const e = ficha.especificacao || {};
  const familia = familiaVinculo(ficha);
  if (familia === 'carro') return texto(e.placa);
  if (familia === 'maquina') return texto(e.numeroSerie);
  if (familia === 'telefonia') return texto(ficha.identificacao) || texto(e.numeroSerie) || texto(e.imei);
  if (familia === 'seguranca' || familia === 'incendio') return texto(e.numero) ? `nº ${texto(e.numero)}` : texto(e.local);
  return texto(ficha.identificacao) || texto(e.local);
}
// Rótulo curto da ficha: o seletor nativo do celular corta o texto longo.
export function rotuloFicha(ficha) {
  if (!ficha) return 'Sem nome';
  const partes = [texto(ficha.nome) || 'Sem nome', complemento(ficha)].filter(Boolean).join(' · ');
  return partes.length > LIMITE_ROTULO ? `${partes.slice(0, LIMITE_ROTULO - 1).trimEnd()}…` : partes;
}
export function rotuloLigadoA(vinculo) {
  if (vinculo?.oculta) return 'uma ficha de Segurança';
  if (!vinculo?.ficha) return 'Ficha retirada';
  const familia = familiaVinculo(vinculo.ficha);
  return familia ? `${ROTULO_FAMILIA_VINCULO[familia]} · ${rotuloFicha(vinculo.ficha)}` : rotuloFicha(vinculo.ficha);
}
// O mesmo {rótulo} das mensagens do servidor: família e nome da ficha.
export function rotuloVinculoServidor(ligacao) {
  if (ligacao?.oculta) return 'uma ficha de Segurança';
  if (!ligacao?.ficha) return 'uma ficha retirada';
  const familia = familiaVinculo(ligacao.ficha);
  return `${ROTULO_FAMILIA_VINCULO[familia] || 'Ficha'} · ${texto(ligacao.ficha.nome) || 'Sem nome'}`;
}

// Nada é copiado entre os dois lados; a tela só avisa quando os setores diferem.
export function setorDivergente(bem, ficha, setores = []) {
  const setorId = texto(ficha?.especificacao?.setorId), sigla = texto(bem?.setorSigla);
  if (!setorId || !sigla) return null;
  const daFicha = (setores || []).find(s => s.id === setorId);
  if (!daFicha || texto(daFicha.sigla) === sigla) return null;
  const doBem = (setores || []).find(s => s.sigla === sigla);
  return { bem: texto(doBem?.nome) || sigla, ficha: texto(daFicha.nome) || texto(daFicha.sigla) };
}

// O vínculo visto pela ficha de cima, para o campo "Bem do inventário".
// "livre": a ficha pode escolher um bem (e só então o salvar manda bemId).
// "sumido": a ficha aponta para um bem que não está mais no inventário.
export function vinculoDaFicha(ficha, bens = []) {
  if (!ficha?.id) return { estado: 'livre', bem: null, bemIds: [] };
  const bemId = texto(ficha.bemId);
  const origem = (bens || []).filter(b => b?.id && texto(b.origemAtivoId) === ficha.id);
  const direto = bemId ? (bens || []).find(b => b?.id === bemId) || null : null;
  const bemIds = [...new Set([bemId, ...origem.map(b => b.id)].filter(Boolean))];
  if (bemIds.length > 1 || (direto && texto(direto.origemAtivoId) && direto.origemAtivoId !== ficha.id)) return { estado: 'conflito', bem: null, bemIds };
  if (bemId && !direto) return { estado: 'sumido', bem: null, bemIds };
  const bem = direto || origem[0] || null;
  return bem ? { estado: 'ligado', bem, bemIds } : { estado: 'livre', bem: null, bemIds };
}

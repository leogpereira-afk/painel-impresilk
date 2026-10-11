import { vinculoDoEquipamento } from './equipamentos-patrimonio.js';

const texto = valor => String(valor ?? '').trim();
const normalizar = valor => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const chaveCategoria = valor => normalizar(valor).replace(/[^a-z0-9]+/g, ' ').trim();

// As sugestões não reclassificam cadastros antigos. A Manutenção conserva
// seus rótulos históricos; Estrutura apresenta os novos nomes por primeiro.
const CATEGORIAS_LEGADAS = [
  'Câmeras / CFTV', 'Ar condicionado', 'Elétrica', 'Hidráulica',
  'Portão / automatizador', 'Alarme', 'Rede e internet', 'Combate a incêndio',
  'Estrutura e telhado', 'Pintura', 'Compressor', 'Exaustão', 'Iluminação',
  'Móvel / bancada',
];
const CATEGORIAS_NOVAS = [
  'Ar-condicionado', 'Ventilador', 'Bebedouro', 'Itens de cozinha',
  'Caixa-d’água', 'Portão', 'Motor', 'Outros itens físicos',
];
const categoriasUnicas = categorias => {
  const vistas = new Set();
  return categorias.filter(categoria => {
    const chave = chaveCategoria(categoria);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
};

export const CATEGORIAS_ESTRUTURA = categoriasUnicas([...CATEGORIAS_NOVAS, ...CATEGORIAS_LEGADAS].filter(c => !['Câmeras / CFTV', 'Alarme', 'Rede e internet'].includes(c)));
export const CATEGORIAS_PREDIAL_COMPARTILHADAS = categoriasUnicas([...CATEGORIAS_LEGADAS, ...CATEGORIAS_NOVAS, 'Padrão de energia', 'Transformador', 'Usina fotovoltaica']);

// Um registro por ativo predial. Nome parecido, local e modelo nunca criam
// vínculo com o inventário; essa decisão usa o mesmo helper dos equipamentos.
export function prepararEstrutura(ativos = [], bens = [], setores = []) {
  const ids = new Set();
  return ativos.filter(ativo => {
    if (!ativo?.id || ativo.tipo !== 'predial' || ids.has(ativo.id)) return false;
    ids.add(ativo.id);
    return true;
  }).map(ativo => {
    const { bem, vinculo } = vinculoDoEquipamento(ativo, bens);
    const ficha = ativo.especificacao || {};
    const setorSigla = texto(bem?.setorSigla);
    const setor = setores.find(item => item.sigla === setorSigla);
    return {
      ...ativo, bem, vinculo,
      codigo: texto(bem?.codigo),
      setorSigla,
      setor: texto(setor?.nome) || setorSigla || texto(ficha.setor),
      local: texto(ficha.local),
      categoria: texto(ativo.categoria) || 'Outros itens físicos',
      modelo: texto(ficha.marcaModelo) || [ficha.fabricante, ficha.modelo].map(texto).filter(Boolean).join(' · '),
      quantidade: texto(ficha.quantidade),
      instalacao: texto(ficha.instalacao),
      responsavel: texto(ativo.responsavel),
      autoria: texto(ativo.atualizadoPorNome) || texto(ativo.atualizadoPor)
        || texto(ativo.criadoPorNome) || texto(ativo.criadoPor),
    };
  }).sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), 'pt-BR', { numeric: true })
    || String(a.id).localeCompare(String(b.id)));
}

export function filtrarEstrutura(itens = [], { busca = '', categoria = '', vinculo = 'todos' } = {}) {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  const categoriaBuscada = chaveCategoria(categoria);
  return itens.filter(item => item.tipo === 'predial'
    && (!categoriaBuscada || categoriaBuscada === 'todos' || chaveCategoria(item.categoria) === categoriaBuscada)
    && (vinculo === 'todos' || (vinculo === 'vinculado' ? item.vinculo === 'vinculado' : item.vinculo !== 'vinculado'))
    && termos.every(termo => normalizar([item.nome, item.identificacao, item.categoria, item.modelo, item.setor,
      item.setorSigla, item.local, item.codigo, item.responsavel, item.autoria].join(' ')).includes(termo)));
}

export const GRUPOS_ESTRUTURA = [
  { id: 'todos', nome: 'Todos os itens' },
  { id: 'hidraulica', nome: 'Manutenção hidráulica' },
  { id: 'eletrica', nome: 'Manutenção elétrica' },
];
export function filtrarGrupoEstrutura(itens = [], grupo = 'todos') {
  const categorias = grupo === 'hidraulica' ? ['hidraulica', 'caixa d agua'] : grupo === 'eletrica' ? ['eletrica', 'iluminacao'] : null;
  return categorias ? itens.filter(i => categorias.includes(chaveCategoria(i.categoria))) : itens;
}
export function historicoEstrutura(mapa = {}, itens = [], agora = new Date()) {
  const ids = new Set(itens.map(i => i.id));
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(agora);
  const ano = partes.find(p => p.type === 'year').value;
  const mes = `${ano}-${partes.find(p => p.type === 'month').value}`;
  const registros = Object.entries(mapa).filter(([, r]) => r && ids.has(r.ativoId)).map(([id, r]) => ({ ...r, id }))
    .sort((a,b) => String(b.data).localeCompare(String(a.data)));
  const periodo = data => /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : (() => {
    const d = new Date(data);if (!Number.isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  })();
  const soma = prefixo => registros.reduce((total,r) => total + (periodo(r.data).startsWith(prefixo) && Number.isFinite(Number(r.valor)) ? Number(r.valor) : 0), 0);
  return { registros, mes: soma(mes), ano: soma(ano), porItem: Object.fromEntries(itens.map(i => [i.id, registros.filter(r => r.ativoId === i.id)])) };
}

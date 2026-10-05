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

export const CATEGORIAS_ESTRUTURA = categoriasUnicas([...CATEGORIAS_NOVAS, ...CATEGORIAS_LEGADAS]);
export const CATEGORIAS_PREDIAL_COMPARTILHADAS = categoriasUnicas([...CATEGORIAS_LEGADAS, ...CATEGORIAS_NOVAS]);

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

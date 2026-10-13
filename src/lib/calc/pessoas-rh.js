// Pessoas do RH nas telas do Patrimônio: a identidade é a ficha (`id`), com o ID
// da empresa (`idPessoa`, 6 dígitos, o do crachá e do PCP) ao lado. O nome só se exibe.
const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const ID_EMPRESA = /^\d{6}$/;

export function rotuloPessoa(p) {
  if (!p) return '';
  return `${p.nome}${ID_EMPRESA.test(String(p.idPessoa || '')) ? ' · ID ' + p.idPessoa : ''}`;
}

// Primeiro a ficha. Se a ficha sumiu (unificada ou recriada no RH), o ID da empresa
// gravado no vínculo acha a mesma pessoa, desde que só uma ficha tenha esse ID.
export function pessoaDoVinculo(pessoas = [], id = '', idPessoa = '') {
  if (id) {
    const pela = pessoas.find(p => p.id === id);
    if (pela) return pela;
  }
  if (ID_EMPRESA.test(String(idPessoa || ''))) {
    const achadas = pessoas.filter(p => p.idPessoa === idPessoa);
    if (achadas.length === 1) return achadas[0];
  }
  return null;
}

// Nome digitado antes do vínculo pelo RH. Sugere a pessoa só quando UMA ficha
// combina, contando quem saiu (o xará desligado deixa o nome ambíguo), e só se
// ela estiver ativa. A sugestão nunca grava sozinha: alguém confirma na tela.
export function sugerirPessoa(nomeAntigo, pessoas = []) {
  const alvo = normalizar(nomeAntigo);
  if (!alvo) return {pessoa: null, motivo: 'vazio'};
  const achadas = pessoas.filter(p => {
    const nome = normalizar(p.nome), apelido = normalizar(p.apelido);
    return nome === alvo || apelido === alvo || nome.startsWith(alvo + ' ');
  });
  if (!achadas.length) return {pessoa: null, motivo: 'nenhuma'};
  if (achadas.length > 1) return {pessoa: null, motivo: 'varias', quantas: achadas.length};
  if (!achadas[0].disponivel) return {pessoa: null, motivo: 'fora'};
  return {pessoa: achadas[0], motivo: 'unica'};
}

export const MOTIVO_SEM_SUGESTAO = {
  vazio: '',
  nenhuma: 'Nenhuma pessoa do RH com esse nome.',
  varias: 'Mais de uma pessoa do RH com esse nome. Escolha pelo ID.',
  fora: 'A única pessoa com esse nome não está ativa no RH.',
};

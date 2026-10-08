import { diasEntre } from '../format.js';

export const GRUPOS_AGENDA = ['Atrasados', 'Hoje', 'Amanhã', 'Próximos 7 dias', 'Mais adiante', 'Sem data marcada'];

export function prazoCompromisso(dias) {
  if (dias === null) return { texto: 'Sem data', tom: 'neutro', peso: 100000, grupo: 'Sem data marcada' };
  if (dias < 0) return { texto: `${-dias} ${dias === -1 ? 'dia' : 'dias'} de atraso`, tom: 'atrasado', peso: dias, grupo: 'Atrasados' };
  if (dias === 0) return { texto: 'Hoje', tom: 'hoje', peso: 0, grupo: 'Hoje' };
  if (dias === 1) return { texto: 'Amanhã', tom: 'futuro', peso: 1, grupo: 'Amanhã' };
  return { texto: `Em ${dias} dias`, tom: 'futuro', peso: dias, grupo: dias <= 7 ? 'Próximos 7 dias' : 'Mais adiante' };
}

const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return false;
  const d = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

// Só organiza o mapa já autorizado pelo servidor. Os filtros nunca ampliam o acesso.
export function montarAgenda(mapa, { hoje, pessoa = '', usuario = '', busca = '', tipo = '', recorte = 'abertos' } = {}) {
  const todos = Object.entries(mapa || {}).filter(([, c]) => c && typeof c === 'object').map(([id, c]) => {
    const dias = dataValida(c.data) ? diasEntre(hoje, c.data) : null;
    return { ...c, id, dono: c.dono ?? usuario, dias, pz: prazoCompromisso(dias) };
  });
  const pessoas = [...new Set(todos.map(c => c.dono).filter(Boolean))].map(dono => {
    const registros = todos.filter(c => c.dono === dono), abertos = registros.filter(c => !c.feito);
    return { dono, nome: registros.find(c => c.donoNome)?.donoNome || dono, emAberto: abertos.length,
      atrasados: abertos.filter(c => c.dias !== null && c.dias < 0).length };
  }).sort((a, b) => b.atrasados - a.atrasados || b.emAberto - a.emAberto || a.nome.localeCompare(b.nome, 'pt-BR'));
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  const base = todos.filter(c => (!pessoa || c.dono === pessoa) && (!tipo || c.tipo === tipo) &&
    termos.every(termo => normalizar([c.titulo, c.cliente, c.donoNome, c.obs, c.id].join(' ')).includes(termo)));
  const abertos = base.filter(c => !c.feito).sort((a, b) => a.pz.peso - b.pz.peso ||
    String(a.hora || '99:99').localeCompare(String(b.hora || '99:99')) || String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
  const feitos = base.filter(c => c.feito).sort((a, b) => String(b.feitoEm || '').localeCompare(String(a.feitoEm || '')));
  const atrasado = c => c.dias !== null && c.dias < 0;
  const proximo = c => c.dias > 0 && c.dias <= 7;
  const filtros = { abertos: () => true, atrasados: atrasado, hoje: c => c.dias === 0,
    proximos: proximo, semData: c => c.dias === null };
  const visiveis = recorte === 'feitos' ? feitos : abertos.filter(filtros[recorte] || filtros.abertos);
  const grupos = recorte === 'feitos'
    ? (visiveis.length ? [{ nome: 'Resolvidos', itens: visiveis }] : [])
    : GRUPOS_AGENDA.map(nome => ({ nome, itens: visiveis.filter(c => c.pz.grupo === nome) })).filter(g => g.itens.length);
  return { grupos, pessoas, exibidos: visiveis.length, total: todos.length,
    emAberto: abertos.length, atrasados: abertos.filter(atrasado).length, hoje: abertos.filter(c => c.dias === 0).length,
    proximos: abertos.filter(proximo).length, semData: abertos.filter(c => c.dias === null).length, concluidos: feitos.length };
}

export function numeroWhatsApp(telefone) {
  const numero = String(telefone || '').replace(/\D/g, '');
  return numero.length === 10 || numero.length === 11 ? `55${numero}` : numero;
}

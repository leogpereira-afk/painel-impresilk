import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciclo90, xpVirada, conquistasVirada, CULTURA, MODELOS_MISSAO } from './virada.mjs';
import { respostaVirada } from '../review/virada.mjs';

test('ciclo sem data ou com data inválida não inventa progresso', () => {
  for (const data of [null, '', '2026-02-30', 'não é uma data']) {
    assert.deepEqual({ ...ciclo90(data, '2026-11-15') }, { dia: 0, percentual: 0, fase: null, situacao: 'nao_iniciado', diasRestantes: 90, inicio: null, fim: null, rotuloFase: 'Início a combinar' });
  }
  assert.equal(ciclo90('2026-11-16', '2026-11-15').situacao, 'agendado');
  assert.equal(ciclo90('2026-11-16', '2026-11-15').dia, 0);
});

test('ciclo respeita as três fases, 90º dia inclusivo e ano bissexto', () => {
  const inicio = '2024-01-01';
  for (const [data, dia, fase] of [['2024-01-01', 1, 30], ['2024-01-30', 30, 30], ['2024-01-31', 31, 60], ['2024-02-29', 60, 60], ['2024-03-01', 61, 90], ['2024-03-30', 90, 90]]) {
    const c = ciclo90(inicio, data);
    assert.equal(c.dia, dia);
    assert.equal(c.fase, fase);
    assert.equal(c.fim, '2024-03-30');
    assert.equal(c.situacao, 'em_curso');
  }
  const encerrado = ciclo90(inicio, '2024-03-31');
  assert.equal(encerrado.situacao, 'encerrado');
  assert.equal(encerrado.dia, 90);
  assert.equal(encerrado.percentual, 100);
  assert.equal(encerrado.diasRestantes, 0);
});

test('virada de dia usa São Paulo, independentemente do fuso do computador', () => {
  assert.equal(ciclo90('2026-11-15', new Date('2026-11-16T02:59:59Z')).dia, 1);
  assert.equal(ciclo90('2026-11-15', new Date('2026-11-16T03:00:00Z')).dia, 2);
  assert.equal(ciclo90('2026-11-15', new Date('2026-11-15T02:59:59Z')).situacao, 'agendado');
});

test('XP deriva de validação atual sem somar histórico, anexos ou cliente', () => {
  const missao = { id: 'm1', status: 'validada', xp: 900, historico: [{ xp: 10 }, { xp: -10 }, { xp: 10 }], evidencias: [{ fotos: [{}, {}] }], comentarios: [{}] };
  assert.equal(xpVirada([missao, missao]), 10);
  assert.equal(xpVirada([{ ...missao, status: 'em_andamento' }]), 0);
  assert.equal(xpVirada([{ ...missao, status: 'em_validacao' }]), 0);
  assert.equal(xpVirada([{ ...missao, status: 'validada' }]), 10);
  assert.equal(xpVirada([]), 0);
  assert.equal(conquistasVirada([]).every(c => !c.conquistada), true);
});

test('conhecimento compartilhado exige confirmação do revisor e validação vigente', () => {
  const missao = { id: 'm1', tipo: 'aprendizado', status: 'validada', conhecimentoCompartilhado: false };
  const compartilhou = m => conquistasVirada([m]).find(c => c.id === 'conhecimento_compartilhado').conquistada;
  assert.equal(compartilhou(missao), false);
  assert.equal(compartilhou({ ...missao, conhecimentoCompartilhado: true }), true);
  assert.equal(compartilhou({ ...missao, status: 'em_andamento', conhecimentoCompartilhado: true }), false);
  assert.equal(compartilhou({ ...missao, tipo: 'melhoria', conhecimentoCompartilhado: true }), false);
});

test('cultura e modelos mantêm o escopo de 90 dias sem pessoas reais', () => {
  assert.equal(CULTURA.missao, 'Transformar o visual em ambientes agradáveis com resultados.');
  assert.equal(CULTURA.visao, 'Ser excelência na entrega.');
  assert.equal(CULTURA.valores.length, 12);
  assert.equal(MODELOS_MISSAO.length, 10);
  assert.ok(MODELOS_MISSAO.every(m => [30, 60, 90].includes(m.fase) && m.criterio && m.objetivo));
});

const chamada = async (action, dados = {}, perfil = '') => {
  const resposta = await respostaVirada(`https://review.invalid/painel-virada?perfil=${perfil}`, { method: 'POST', body: JSON.stringify({ action, ...dados }) });
  return { status: resposta.status, body: await resposta.json() };
};

test('perfil da revisão sem permissão não recebe dados nem configuração', async () => {
  for (const action of ['listar', 'pessoas', 'reiniciarDemo']) {
    const r = await chamada(action, {}, 'virada-sem-acesso');
    assert.equal(r.status, 403);
    assert.equal(r.body.ciclo, undefined);
    assert.equal(r.body.pessoas, undefined);
  }
});

test('mock mantém privacidade, prioridade única, fotos, comentários e XP em reabertura', async () => {
  const armazenamento = new Map();
  const anterior = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => armazenamento.get(key) || null, setItem: (key, value) => armazenamento.set(key, value) };
  try {
    let ciclo = (await chamada('reiniciarDemo')).body.ciclo;
    assert.equal(xpVirada(ciclo.missoes), 0);
    const ana = ciclo.participantes.find(p => p.rhId === 'review-lider');
    const bruno = ciclo.participantes.find(p => p.rhId === 'review-mentor');
    const alvo = ciclo.missoes.find(m => m.participanteId === ana.id);
    const privada = ciclo.missoes.find(m => m.participanteId !== ana.id && m.participanteId !== bruno.id);
    const enviar = async (action, dados = {}, perfil = '') => {
      const r = await chamada(action, { idCiclo: ciclo.id, versao: ciclo.versao, ...dados }, perfil);
      if (r.status === 200 && r.body.ciclo) ciclo = (await chamada('listar')).body.ciclo;
      return r;
    };
    const lider = await chamada('listar', {}, 'virada-lider');
    assert.equal(lider.body.ciclo.missoes.length, 1);
    assert.equal(lider.body.podeConfigurar, false);
    assert.equal((await chamada('pessoas', {}, 'virada-lider')).status, 403);
    assert.equal((await enviar('comentar', { missaoId: privada.id, texto: 'Não pode acessar' }, 'virada-lider')).status, 404);
    assert.equal((await enviar('estado', { missaoId: alvo.id, status: 'em_validacao' }, 'virada-lider')).status, 422);
    assert.equal((await enviar('estado', { missaoId: alvo.id, status: 'em_andamento' }, 'virada-lider')).status, 200);
    assert.equal((await enviar('salvarMissao', { item: { participanteId: ana.id, titulo: 'Segunda prioridade de exemplo', objetivo: 'Conferir a regra de foco.', criterio: 'Uma prioridade em prática por vez.', tipo: 'compromisso', fase: 30, prazo: null } }, 'virada-mentor')).status, 200);
    const segunda = ciclo.missoes.at(-1);
    assert.equal((await enviar('estado', { missaoId: segunda.id, status: 'em_andamento' }, 'virada-lider')).status, 409);
    const antigo = ciclo.versao;
    assert.equal((await enviar('evidencia', { missaoId: alvo.id, texto: 'Conferência de exemplo executada.', resultado: 'Informação recebida e conferida.', aprendizado: 'Aprendizado privado.' }, 'virada-lider')).status, 200);
    assert.equal((await chamada('comentar', { idCiclo: ciclo.id, versao: antigo, missaoId: alvo.id, texto: 'Desatualizado' }, 'virada-lider')).status, 409);
    const e = ciclo.missoes.find(m => m.id === alvo.id).evidencias[0];
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhCcAAAAASUVORK5CYII=';
    assert.equal((await enviar('anexar', { missaoId: alvo.id, evidenciaId: e.id, nome: 'teste.png', mime: 'image/png', base64: btoa('isto não é uma foto') }, 'virada-lider')).status, 422);
    assert.equal((await enviar('anexar', { missaoId: alvo.id, evidenciaId: e.id, nome: 'teste.png', mime: 'image/png', base64: png }, 'virada-lider')).status, 200);
    const foto = ciclo.missoes.find(m => m.id === alvo.id).evidencias[0].fotos[0];
    assert.equal('chave' in foto, false);
    const leitura = await chamada('foto', { idCiclo: ciclo.id, missaoId: alvo.id, arquivoId: foto.id }, 'virada-lider');
    assert.equal(leitura.status, 200);
    assert.equal(leitura.body.url, `data:image/png;base64,${png}`);
    assert.equal((await enviar('comentar', { missaoId: alvo.id, texto: 'Feedback privado.' }, 'virada-mentor')).status, 200);
    assert.equal(xpVirada(ciclo.missoes), 0);
    assert.equal((await enviar('publicar', { missaoId: alvo.id, titulo: 'Melhoria de exemplo', texto: 'Resumo escolhido para a equipe.', evidenciaIds: [e.id] }, 'virada-lider')).status, 200);
    const mural = ciclo.mural[0];
    assert.equal(JSON.stringify(mural).includes('Aprendizado privado'), false);
    assert.equal(JSON.stringify(mural).includes('Feedback privado'), false);
    assert.equal((await enviar('comentar', { postId: mural.id, texto: 'Comentário de equipe.' }, 'virada-mentor')).status, 200);
    assert.equal((await enviar('estado', { missaoId: alvo.id, status: 'em_validacao' }, 'virada-lider')).status, 200);
    assert.equal((await enviar('validar', { missaoId: alvo.id, parecer: 'Tentativa de validar a própria missão.' }, 'virada-lider')).status, 403);
    assert.equal((await enviar('validar', { missaoId: alvo.id, parecer: 'Execução e resultado conferidos.' }, 'virada-mentor')).status, 200);
    assert.equal(xpVirada(ciclo.missoes), 10);
    assert.equal((await enviar('validar', { missaoId: alvo.id, parecer: 'Repetido.' }, 'virada-mentor')).status, 409);
    assert.equal((await enviar('reabrir', { missaoId: alvo.id, motivo: 'Ajustar um ponto observado.' }, 'virada-mentor')).status, 200);
    assert.equal(xpVirada(ciclo.missoes), 0);
    assert.equal((await enviar('estado', { missaoId: alvo.id, status: 'em_validacao' }, 'virada-lider')).status, 200);
    assert.equal((await enviar('validar', { missaoId: alvo.id, parecer: 'Ajuste conferido.' }, 'virada-mentor')).status, 200);
    assert.equal(xpVirada(ciclo.missoes), 10);
    assert.equal(armazenamento.size, 1);
    const salvo = JSON.parse([...armazenamento.values()][0]);
    assert.equal(salvo.ciclo.versao, ciclo.versao);
    assert.equal(salvo.arquivos[foto.id], `data:image/png;base64,${png}`);
    const recarregado = await import('../review/virada.mjs?simulacao-reload');
    const depoisReload = await recarregado.respostaVirada('https://review.invalid/painel-virada?perfil=virada-lider', { body: JSON.stringify({ action: 'listar' }) });
    assert.equal((await depoisReload.json()).ciclo.versao, ciclo.versao);
    const fotoReload = await recarregado.respostaVirada('https://review.invalid/painel-virada?perfil=virada-lider', { body: JSON.stringify({ action: 'foto', idCiclo: ciclo.id, missaoId: alvo.id, arquivoId: foto.id }) });
    assert.equal((await fotoReload.json()).url, `data:image/png;base64,${png}`);
    const setItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('Quota'); };
    assert.equal((await enviar('comentar', { missaoId: alvo.id, texto: 'Não pode parecer salvo.' }, 'virada-lider')).status, 413);
    globalThis.localStorage.setItem = setItem;
    assert.equal((await chamada('listar')).body.ciclo.versao, ciclo.versao);
  } finally { globalThis.localStorage = anterior; }
});

test('mock preserva a confirmação de ensino do revisor e a revoga na reabertura', async () => {
  let ciclo = (await chamada('reiniciarDemo')).body.ciclo;
  const missao = ciclo.missoes.find(m => m.tipo === 'aprendizado');
  const enviar = async (action, dados) => {
    const r = await chamada(action, { idCiclo: ciclo.id, versao: ciclo.versao, missaoId: missao.id, ...dados });
    assert.equal(r.status, 200, r.body.erro);
    ciclo = r.body.ciclo;
  };
  await enviar('evidencia', { texto: 'Método ensinado e execução acompanhada.', resultado: 'A pessoa orientada demonstrou a execução.' });
  await enviar('estado', { status: 'em_validacao' });
  await enviar('validar', { parecer: 'Demonstração de aprendizagem conferida.', conhecimentoCompartilhado: true });
  assert.equal(conquistasVirada(ciclo.missoes).find(c => c.id === 'conhecimento_compartilhado').conquistada, true);
  await enviar('reabrir', { motivo: 'Conferir novamente uma etapa do método.' });
  assert.equal(conquistasVirada(ciclo.missoes).find(c => c.id === 'conhecimento_compartilhado').conquistada, false);
  assert.equal(ciclo.missoes.find(m => m.id === missao.id).conhecimentoCompartilhado, false);
});

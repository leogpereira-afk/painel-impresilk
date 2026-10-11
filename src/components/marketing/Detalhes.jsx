/* AS OUTRAS GAVETAS DO MARKETING: o item do playbook (ver, concluir com a
 * evidência, reabrir), a publicação (lançar colando o link, editar os
 * números, retirar) e os números da semana do canal.
 *
 * Todo número lançado aqui é MEDIDA: campo vazio vai como nulo ("não
 * informado") e nunca vira zero. O servidor carimba a fonte ("manual") e a
 * data; a gaveta mostra a legenda de onde o número veio.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Gaveta from '../Gaveta.jsx';
import { useMarketing, mudouNoServidor } from './contexto.js';
import { opcoesDeCanal } from './FormAcao.jsx';
import { nomeDoResponsavel, semanasRecentes } from './derivar.js';
import { CAMPOS_METRICAS, fonteDoNumero, somarDias } from '../../lib/calc/marketing-canais.js';
import { NUMEROS_PUBLICACAO, lerInteiro } from '../../lib/calc/marketing-csv.js';
import { dataCurta, dataLonga, numero } from '../../lib/format.js';
import { concluirPlaybook, salvarPublicacao, retirarPublicacao, salvarMetricas } from '../../services/marketing.js';

const TIPO = { unica: 'Ação única', rotina: 'Rotina', gatilho: 'Gatilho' };
const RECORRENCIA = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', cada_n_dias: 'A cada N dias' };
const PRIORIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const EVIDENCIA = { nenhuma: 'Nenhuma', link: 'Link', foto: 'Foto', texto: 'Texto' };
const ROTULO_NUMERO = { alcance: 'Alcance', impressoes: 'Impressões', engajamento: 'Engajamento', cliques: 'Cliques', leads: 'Leads' };

export const textoRecorrencia = (i) => {
  if (i.tipo !== 'rotina') return '';
  const quando = i.recorrencia === 'cada_n_dias' ? `A cada ${i.aCadaDias} dias` : RECORRENCIA[i.recorrencia] || '';
  return i.metaQuantidade > 1 ? `${quando}, meta de ${i.metaQuantidade}` : quando;
};
export { TIPO as TIPO_PLAYBOOK, RECORRENCIA, PRIORIDADE, EVIDENCIA };

const linkSeguro = (v) => (/^https?:\/\//i.test(String(v || '')) ? v : null);

function Linha({ rotulo, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-t py-2 text-sm first:border-0" style={{ borderColor: 'var(--fio-lista)' }}>
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- item -- */

/** O que o item pede para ser concluído: o campo e se é obrigatório (a mesma
 *  regra do servidor, prepararConclusao: link e texto são obrigatórios). */
function campoDeEvidencia(evidencia) {
  if (evidencia === 'link') return { rotulo: 'Link que comprova', tipo: 'url', obrigatorio: true, dica: 'Cole o link da publicação, da página ou do documento.' };
  if (evidencia === 'texto') return { rotulo: 'O que foi feito', tipo: 'texto', obrigatorio: true, dica: 'Escreva em poucas palavras o que foi entregue.' };
  if (evidencia === 'foto') {
    return { rotulo: 'Onde está a foto', tipo: 'texto', obrigatorio: false, dica: 'O envio da foto chega na próxima etapa. Por enquanto, cole o link do Drive ou descreva.' };
  }
  return { rotulo: 'Observação', tipo: 'texto', obrigatorio: false, dica: 'Opcional.' };
}

export function DetalheItem({ id, onFechar }) {
  const { painel, pessoas, canaisPorId, podeGravar, ehGestao, trocar, recarregar, avisar, sairLinha } = useMarketing();
  const item = painel.playbook.find((i) => i.id === id);
  const [evidencia, setEvidencia] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  if (!item) {
    return (
      <Gaveta aberta titulo="Item do playbook" onFechar={onFechar}>
        <p className="text-sm text-slate-600">Este item não existe mais. Ele pode ter sido retirado do playbook.</p>
      </Gaveta>
    );
  }
  const canal = canaisPorId.get(item.canalId);
  const unica = item.tipo === 'unica';
  const ev = campoDeEvidencia(item.evidencia);

  async function marcar(feito) {
    setErro('');
    setSalvando(true);
    try {
      const salvo = await concluirPlaybook(item.id, item.versao, feito, feito ? evidencia : undefined);
      trocar.item(salvo);
      // A linha do Fazer que pediu a evidência (se havia) pode sair já.
      sairLinha(`item:${item.id}`);
      setEvidencia('');
      avisar(feito ? `"${item.titulo}" concluído.` : `"${item.titulo}" reaberto.`);
    } catch (err) {
      if (mudouNoServidor(err)) {
        onFechar();
        await recarregar();
        avisar(`${err.message} A lista foi atualizada.`, 'erro');
      } else setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta aberta titulo={item.titulo} onFechar={onFechar} ocupado={salvando}>
      <div className="space-y-5">
        <dl>
          <Linha rotulo="Tipo">
            {TIPO[item.tipo] || item.tipo}
            {item.implantacao ? ' · implantação do canal' : ''}
            {item.ativo === false ? ' · retirado do playbook' : ''}
          </Linha>
          <Linha rotulo="Canal">{canal?.nome || 'Canal não encontrado'}</Linha>
          <Linha rotulo="Responsável">{nomeDoResponsavel({ responsavelId: item.responsavelId }, pessoas) || 'Sem responsável padrão'}</Linha>
          <Linha rotulo="Prioridade">{PRIORIDADE[item.prioridade] || item.prioridade}</Linha>
          <Linha rotulo="Recorrência">{textoRecorrencia(item)}</Linha>
          <Linha rotulo="Evento">{item.tipo === 'gatilho' ? item.gatilho : null}</Linha>
          <Linha rotulo="Prazo">{item.prazoDias != null ? `${item.prazoDias} ${item.prazoDias === 1 ? 'dia' : 'dias'} depois de gerada a tarefa` : null}</Linha>
          <Linha rotulo="Evidência pedida">{EVIDENCIA[item.evidencia] || item.evidencia}</Linha>
        </dl>

        {item.instrucao && (
          <section>
            <h3 className="label">Como fazer</h3>
            <p className="whitespace-pre-line text-sm text-slate-700">{item.instrucao}</p>
          </section>
        )}
        {item.checklist?.length > 0 && (
          <section>
            <h3 className="label">Checklist</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {item.checklist.map((c, n) => (
                <li key={n}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        {!unica && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Rotinas e gatilhos entram na agenda de cada pessoa na próxima etapa.</p>}

        {unica && item.concluidoEm && (
          <section className="rounded-lg bg-ok-50 p-3 text-sm text-ok-700">
            <p>
              Feito em {dataLonga(item.concluidoEm)}
              {item.concluidoPor ? ` por ${item.concluidoPor}` : ''}.
            </p>
            {item.evidenciaValor &&
              (linkSeguro(item.evidenciaValor) ? (
                <a className="mt-1 block break-all underline" href={item.evidenciaValor} target="_blank" rel="noopener noreferrer">
                  {item.evidenciaValor}
                </a>
              ) : (
                <p className="mt-1 whitespace-pre-line">{item.evidenciaValor}</p>
              ))}
            {podeGravar && (
              <button type="button" className="btn-outline mt-3 min-h-11" disabled={salvando} onClick={() => marcar(false)}>
                Reabrir item
              </button>
            )}
          </section>
        )}

        {unica && !item.concluidoEm && podeGravar && item.ativo !== false && (
          <form
            className="space-y-3 border-t pt-4"
            style={{ borderColor: 'var(--hairline)' }}
            onSubmit={(e) => {
              e.preventDefault();
              marcar(true);
            }}
          >
            <label className="label">
              {ev.rotulo}
              {ev.obrigatorio ? '' : ' (opcional)'}
              {ev.tipo === 'url' ? (
                <input className="input" type="url" required maxLength={1000} placeholder="https://" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} />
              ) : (
                <textarea className="input min-h-24" required={ev.obrigatorio} maxLength={1000} value={evidencia} onChange={(e) => setEvidencia(e.target.value)} />
              )}
            </label>
            <p className="text-sm text-slate-500">{ev.dica}</p>
            {erro && (
              <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
                {erro}
              </p>
            )}
            <button className="btn-primary min-h-11" disabled={salvando}>
              {salvando ? 'Gravando...' : 'Marcar como feito'}
            </button>
          </form>
        )}
        {erro && item.concluidoEm && (
          <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
            {erro}
          </p>
        )}

        {ehGestao && (
          <Link className="btn-ghost min-h-11" to="/configuracoes?secao=marketing">
            Editar no playbook (Configurações)
          </Link>
        )}
      </div>
    </Gaveta>
  );
}

/* ---------------------------------------------------------- publicação -- */

const ID_FORM_PUB = 'form-publicacao-marketing';

/** Número de formulário: "1.234" vale 1234; vazio é nulo. Devolve
 *  {valor} ou {erro} (a mesma leitura do CSV, para as duas portas
 *  aceitarem o mesmo jeito de escrever). */
function lerNumeroDoCampo(texto, rotulo) {
  const r = lerInteiro(texto);
  return r.erro ? { erro: `${rotulo}: ${r.erro}.` } : r;
}

export function FormPublicacao({ publicacao, canalId = '', onFechar }) {
  const { painel, hoje, podeGravar, trocar, tirar, recarregar, avisar } = useMarketing();
  const nova = !publicacao;
  const [form, setForm] = useState(() => {
    const base = nova
      ? { id: crypto.randomUUID(), novo: true, canalId: canalId || '', data: hoje, titulo: '', url: '', acaoId: '' }
      : { ...publicacao, canalId: publicacao.canalId, titulo: publicacao.titulo || '', url: publicacao.url || '', acaoId: publicacao.acaoId || '' };
    for (const k of NUMEROS_PUBLICACAO) base[k] = nova || publicacao[k] == null ? '' : String(publicacao[k]);
    return base;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const canais = useMemo(() => opcoesDeCanal(painel.canais, form.canalId), [painel.canais, form.canalId]);
  const acoesDoCanal = useMemo(
    () => painel.acoes.filter((a) => a.canalId === form.canalId || a.id === form.acaoId).sort((a, b) => String(b.prazo).localeCompare(String(a.prazo))),
    [painel.acoes, form.canalId, form.acaoId]
  );
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const travado = !podeGravar;

  async function salvar(e) {
    e.preventDefault();
    if (travado) return;
    setErro('');
    const numeros = {};
    for (const k of NUMEROS_PUBLICACAO) {
      const r = lerNumeroDoCampo(form[k], ROTULO_NUMERO[k]);
      if (r.erro) return setErro(r.erro);
      numeros[k] = r.valor;
    }
    setSalvando(true);
    try {
      const salva = await salvarPublicacao(
        { id: form.id, canalId: form.canalId, data: form.data, titulo: form.titulo, url: form.url.trim() || null, acaoId: form.acaoId || null, ...numeros },
        form.novo ? undefined : form.versao,
        !!form.novo
      );
      trocar.publicacao(salva);
      avisar(nova ? 'Publicação lançada.' : 'Publicação salva.');
      onFechar();
    } catch (err) {
      if (mudouNoServidor(err)) {
        onFechar();
        await recarregar();
        avisar(`${err.message} A lista foi atualizada.`, 'erro');
      } else setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function retirar() {
    if (!window.confirm('Retirar esta publicação? Ela sai dos números e do calendário, e o registro fica guardado no histórico. O mesmo link não volta pela importação de CSV; para trazer de volta, lance o link de novo à mão.')) return;
    setErro('');
    setSalvando(true);
    try {
      await retirarPublicacao(publicacao.id, publicacao.versao);
      tirar.publicacao(publicacao.id);
      avisar('Publicação retirada.');
      onFechar();
    } catch (err) {
      if (mudouNoServidor(err)) {
        onFechar();
        await recarregar();
        avisar(`${err.message} A lista foi atualizada.`, 'erro');
      } else setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const rodape = travado ? (
    <button type="button" className="btn-outline" onClick={onFechar}>
      Fechar
    </button>
  ) : (
    <>
      {!nova && (
        <button type="button" className="btn-ghost mr-auto text-bad-700" disabled={salvando} onClick={retirar}>
          Retirar
        </button>
      )}
      <button type="button" className="btn-ghost" disabled={salvando} onClick={onFechar}>
        Cancelar
      </button>
      <button type="submit" form={ID_FORM_PUB} className="btn-primary" disabled={salvando}>
        {salvando ? 'Salvando...' : nova ? 'Lançar publicação' : 'Salvar publicação'}
      </button>
    </>
  );

  return (
    <Gaveta aberta titulo={nova ? 'Lançar publicação' : 'Publicação'} onFechar={onFechar} rodape={rodape} ocupado={salvando}>
      <form id={ID_FORM_PUB} onSubmit={salvar} className="space-y-4">
        {!nova && <p className="text-sm text-slate-500">{fonteDoNumero(publicacao, hoje)}.</p>}
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
            {erro}
          </p>
        )}
        <fieldset disabled={travado || salvando} className="min-w-0 space-y-4 border-0 p-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Canal
              <select className="input" required value={form.canalId} onChange={campo('canalId')}>
                <option value="">Escolha o canal</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Data
              <input className="input" type="date" required value={form.data} onChange={campo('data')} />
            </label>
          </div>
          <label className="label">
            Link da publicação
            <input className="input" type="url" maxLength={500} placeholder="https://" value={form.url} onChange={campo('url')} />
            <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">
              Cole o link do post. O mesmo link não entra duas vezes no mesmo canal.
            </small>
          </label>
          <label className="label">
            Título
            <input className="input" maxLength={200} value={form.titulo} onChange={campo('titulo')} placeholder="Ex.: Reel da fachada da loja X" />
          </label>
          <label className="label">
            Ação ligada (opcional)
            <select className="input" value={form.acaoId} onChange={campo('acaoId')}>
              <option value="">Nenhuma</option>
              {acoesDoCanal.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.prazo ? ` · ${dataCurta(a.prazo)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="label">Números (deixe em branco o que não sabe)</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {NUMEROS_PUBLICACAO.map((k) => (
                <label key={k} className="text-sm text-slate-600">
                  {ROTULO_NUMERO[k]}
                  <input className="input tnum mt-1" inputMode="numeric" value={form[k]} onChange={campo(k)} />
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
      </form>
    </Gaveta>
  );
}

/* ------------------------------------------------------- números da semana */

const ID_FORM_SEMANA = 'form-metricas-marketing';

function valoresDaSemana(metricas, canalId, semana) {
  const linha = (metricas || []).find((m) => m.canalId === canalId && m.semana === semana) || null;
  const valores = Object.fromEntries(CAMPOS_METRICAS.map(({ campo }) => [campo, linha?.[campo] == null ? '' : String(linha[campo])]));
  return { linha, valores };
}

export function FormMetricas({ canalId, semana: semanaInicial, onFechar }) {
  const { painel, hoje, podeGravar, canaisPorId, trocar, avisar } = useMarketing();
  const semanas = useMemo(() => semanasRecentes(hoje, 8), [hoje]);
  const [semana, setSemana] = useState(() => (semanas.includes(semanaInicial) ? semanaInicial : semanas[0]));
  const [inicial, setInicial] = useState(() => valoresDaSemana(painel.metricas, canalId, semana));
  const [valores, setValores] = useState(inicial.valores);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const canal = canaisPorId.get(canalId);

  function trocarSemana(nova) {
    const v = valoresDaSemana(painel.metricas, canalId, nova);
    setSemana(nova);
    setInicial(v);
    setValores(v.valores);
    setErro('');
  }

  async function salvar(e) {
    e.preventDefault();
    if (!podeGravar) return;
    setErro('');
    // Só vai o número que mudou: assim um número que outra pessoa lançou
    // agora há pouco, e que esta gaveta nem tocou, não volta ao valor velho.
    const mudados = {};
    for (const { campo, rotulo } of CAMPOS_METRICAS) {
      if (valores[campo].trim() === inicial.valores[campo]) continue;
      const r = lerNumeroDoCampo(valores[campo], rotulo);
      if (r.erro) return setErro(r.erro);
      mudados[campo] = r.valor;
    }
    if (!Object.keys(mudados).length) return setErro('Nenhum número mudou.');
    setSalvando(true);
    try {
      const linha = await salvarMetricas(canalId, semana, mudados);
      trocar.metricas(linha);
      avisar(`Números da semana de ${dataCurta(semana)} salvos.`);
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const rodape = podeGravar ? (
    <>
      <button type="button" className="btn-ghost" disabled={salvando} onClick={onFechar}>
        Cancelar
      </button>
      <button type="submit" form={ID_FORM_SEMANA} className="btn-primary" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar números'}
      </button>
    </>
  ) : (
    <button type="button" className="btn-outline" onClick={onFechar}>
      Fechar
    </button>
  );

  return (
    <Gaveta aberta titulo={`Números da semana${canal ? ` · ${canal.nome}` : ''}`} onFechar={onFechar} rodape={rodape} ocupado={salvando}>
      <form id={ID_FORM_SEMANA} onSubmit={salvar} className="space-y-4">
        <label className="label">
          Semana
          <select className="input" value={semana} onChange={(e) => trocarSemana(e.target.value)} disabled={salvando}>
            {semanas.map((s) => (
              <option key={s} value={s}>
                {s === semanas[0] ? 'Esta semana' : 'Semana'} de {dataCurta(s)} a {dataCurta(somarDias(s, 6))}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-500">
          {inicial.linha ? `${fonteDoNumero(inicial.linha, hoje)}. Mude só o que precisa; apagar um número deixa ele sem valor.` : 'Nada lançado nesta semana ainda. Deixe em branco o que não sabe: vazio não vira zero.'}
        </p>
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
            {erro}
          </p>
        )}
        <fieldset disabled={!podeGravar || salvando} className="grid min-w-0 grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-3">
          {CAMPOS_METRICAS.map(({ campo, rotulo }) => (
            <label key={campo} className="text-sm text-slate-600">
              {rotulo}
              <input
                className="input tnum mt-1"
                inputMode="numeric"
                value={valores[campo]}
                onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
                title={inicial.valores[campo] ? `Lançado: ${numero(Number(inicial.valores[campo]))}` : undefined}
              />
            </label>
          ))}
        </fieldset>
      </form>
    </Gaveta>
  );
}

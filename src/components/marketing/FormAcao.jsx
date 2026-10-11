/* A AÇÃO NA GAVETA: criar, editar, ver e retirar.
 *
 * É o formulário que morava dentro da lista "Ações e resultados" (a1), agora
 * na Gaveta, para abrir igual a partir do Fazer, do calendário e da lista.
 * Ganhou na a2:
 *  - CANAL: escolhido entre os canais cadastrados (canalId). O texto que a
 *    ação antiga tinha continua guardado e aparece como "Canal anterior";
 *  - RESPONSÁVEL: a pessoa do RH pelo id_pessoa (responsavelId). O texto
 *    antigo aparece como "Responsável anterior: X" até alguém escolher a
 *    pessoa. O texto nunca é apagado nem editado aqui: ele é história.
 *
 * O texto antigo vai de volta ao servidor do jeito que veio, porque a regra
 * (prepararAcao) exige responsável por pessoa OU por texto: a ação antiga
 * que ainda não tem pessoa continua válida para mudar só a situação.
 *
 * Quem é visualização vê os campos travados e nenhum botão de gravar.
 */
import { useMemo, useState } from 'react';
import Gaveta from '../Gaveta.jsx';
import { useMarketing, useOrcamentosMarketing, mudouNoServidor } from './contexto.js';
import { resolverOrcamentosMarketing } from '../../lib/calc/marketing.js';
import { paraNumero, paraCampo } from '../../lib/format.js';
import { salvarAcaoMarketing, retirarAcaoMarketing } from '../../services/marketing.js';
import { SITUACOES_ACAO } from '../../../supabase/functions/_shared/marketing.mjs';

const VAZIO = { nome: '', objetivo: '', publico: '', canal: '', canalId: '', responsavel: '', responsavelId: '', prazo: '', status: 'Ideia', investimento: '', numeros: '', url: '' };
const ID_FORM = 'form-acao-marketing';

/** As opções de canal: os da fileira e, se a ação aponta para um canal
 *  desativado, ele também (senão o select mostraria outro canal e a gravação
 *  trocaria o canal sem ninguém pedir). */
export function opcoesDeCanal(canais, atual) {
  return (canais || []).filter((c) => c.ativo || c.emImplantacao || c.id === atual);
}

/** As pessoas do select, e a pessoa gravada que não está mais na lista (para
 *  o select não trocar de pessoa sozinho). */
export function opcoesDePessoa(pessoas, atual) {
  const lista = [...(pessoas || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  // Enquanto a lista não chega, a pessoa gravada não está "fora" dela.
  if (atual && !lista.some((p) => p.idPessoa === atual))
    lista.unshift(Array.isArray(pessoas) ? { idPessoa: atual, nome: 'Pessoa fora da lista do RH', fora: true } : { idPessoa: atual, nome: 'Responsável atual' });
  return lista;
}

/* O select de pessoa. Recebe a lista por props (e não do contexto da página)
   porque Configurações também usa, fora da página do Marketing.
   pessoas: null enquanto carrega. */
export function CampoPessoa({ rotulo = 'Responsável', valor, onChange, obrigatorio = false, anterior = '', pessoas, erroPessoas, recarregarPessoas }) {
  const opcoes = opcoesDePessoa(pessoas, valor);
  return (
    <div>
      <label className="label">
        {rotulo}
        <select
          className="input"
          value={valor || ''}
          required={obrigatorio && !anterior}
          disabled={pessoas === null && !erroPessoas}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{pessoas === null && !erroPessoas ? 'Carregando pessoas...' : 'Escolha a pessoa'}</option>
          {opcoes.map((p) => (
            <option key={p.idPessoa} value={p.idPessoa}>
              {p.nome}
              {p.area ? ` · ${p.area}` : ''}
            </option>
          ))}
        </select>
      </label>
      {anterior && !valor && <p className="mt-1 text-sm text-slate-500">Responsável anterior: {anterior}</p>}
      {erroPessoas && (
        <p role="alert" className="mt-1 text-sm text-bad-700">
          A lista de pessoas não carregou: {erroPessoas}{' '}
          <button type="button" className="btn-ghost min-h-11" onClick={recarregarPessoas}>
            Tentar de novo
          </button>
        </p>
      )}
    </div>
  );
}

export default function FormAcao({ acao, canalId = '', onFechar }) {
  const { painel, podeGravar, trocar, tirar, recarregar, avisar, pessoas, erroPessoas, recarregarPessoas } = useMarketing();
  const orcs = useOrcamentosMarketing();
  const nova = !acao;
  const [form, setForm] = useState(() =>
    nova
      ? { ...VAZIO, id: crypto.randomUUID(), novo: true, canalId: canalId || '' }
      : {
          ...VAZIO,
          ...acao,
          canalId: acao.canalId || '',
          responsavelId: acao.responsavelId || '',
          investimento: paraCampo(acao.investimento),
          numeros: (acao.orcamentos || []).map((id) => orcs.find((o) => String(o.id) === id)?.numero || `id:${id}`).join(', '),
        }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const canais = useMemo(() => opcoesDeCanal(painel.canais, form.canalId), [painel.canais, form.canalId]);
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const travado = !podeGravar;

  async function salvar(e) {
    e.preventDefault();
    if (travado) return;
    setErro('');
    setSalvando(true);
    try {
      const ids = resolverOrcamentosMarketing(form.numeros, orcs, form.orcamentos || []);
      // Aviso antes de mandar; quem garante de verdade é o banco.
      if (painel.acoes.some((a) => a.id !== form.id && (a.orcamentos || []).some((id) => ids.includes(id)))) {
        throw new Error('Um desses orçamentos já está vinculado a outra ação. Revise a origem para evitar contar a venda duas vezes.');
      }
      const investimento = paraNumero(form.investimento);
      if (investimento < 0) throw new Error('O investimento não pode ser negativo.');
      if (!form.responsavelId && !String(form.responsavel || '').trim()) throw new Error('Escolha o responsável.');
      const { numeros: _n, versao, novo, criadoEm: _c, atualizadoEm: _a, migrada: _m, ...registro } = form;
      const salva = await salvarAcaoMarketing(
        { ...registro, canalId: form.canalId || null, responsavelId: form.responsavelId || null, orcamentos: ids, investimento },
        novo ? undefined : versao,
        !!novo
      );
      trocar.acao(salva);
      avisar(nova ? `Ação "${salva.nome}" criada.` : `Ação "${salva.nome}" salva.`);
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
    if (!window.confirm(`Retirar a ação "${acao.nome}"? Ela sai da lista e os orçamentos ligados a ela ficam livres para outra ação. O registro fica guardado no histórico.`)) return;
    setErro('');
    setSalvando(true);
    try {
      await retirarAcaoMarketing(acao.id, acao.versao);
      tirar.acao(acao.id);
      avisar(`Ação "${acao.nome}" retirada.`);
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
      <button type="submit" form={ID_FORM} className="btn-primary" disabled={salvando}>
        {salvando ? 'Salvando...' : nova ? 'Criar ação' : 'Salvar ação'}
      </button>
    </>
  );

  return (
    <Gaveta aberta titulo={nova ? 'Nova ação' : travado ? 'Ação' : 'Editar ação'} onFechar={onFechar} rodape={rodape} ocupado={salvando}>
      <form id={ID_FORM} onSubmit={salvar} className="space-y-4">
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
            {erro}
          </p>
        )}
        <fieldset disabled={travado || salvando} className="min-w-0 space-y-4 border-0 p-0">
          <label className="label">
            Ação
            <input className="input" required maxLength={200} value={form.nome} onChange={campo('nome')} />
          </label>
          <div>
            <label className="label">
              Canal
              <select className="input" value={form.canalId} onChange={campo('canalId')}>
                <option value="">Sem canal</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {!c.ativo && !c.emImplantacao ? ' (desativado)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {!form.canalId && form.canal && <p className="mt-1 text-sm text-slate-500">Canal anterior: {form.canal}</p>}
          </div>
          <CampoPessoa
            valor={form.responsavelId}
            anterior={form.responsavel}
            obrigatorio
            pessoas={pessoas}
            erroPessoas={erroPessoas}
            recarregarPessoas={recarregarPessoas}
            onChange={(v) => setForm((f) => ({ ...f, responsavelId: v }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Prazo
              <input className="input" type="date" required value={form.prazo} onChange={campo('prazo')} />
            </label>
            <label className="label">
              Situação
              <select className="input" value={form.status} onChange={campo('status')}>
                {SITUACOES_ACAO.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Não é preciso passar por todas as etapas.</small>
            </label>
          </div>
          <label className="label">
            Objetivo
            <input className="input" maxLength={500} value={form.objetivo} onChange={campo('objetivo')} />
          </label>
          <label className="label">
            Público
            <input className="input" maxLength={300} value={form.publico} onChange={campo('publico')} />
          </label>
          <label className="label">
            Investimento realizado (R$)
            <input className="input" inputMode="decimal" value={form.investimento} onChange={campo('investimento')} />
          </label>
          <label className="label">
            Orçamentos atribuídos à ação
            <input className="input" placeholder="Números separados por vírgula" value={form.numeros} onChange={campo('numeros')} />
            <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">
              Use os números do ERP. Associe somente quando a origem estiver confirmada.
            </small>
          </label>
          <label className="label">
            Link da publicação ou material
            <input className="input" type="url" maxLength={500} value={form.url} onChange={campo('url')} placeholder="https://" />
          </label>
        </fieldset>
      </form>
    </Gaveta>
  );
}

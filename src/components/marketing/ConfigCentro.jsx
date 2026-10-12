/* CONFIGURAÇÕES > MARKETING: CANAIS, PLAYBOOK, PAPÉIS E CARGA PADRÃO (a2).
 *
 * Só a GESTÃO do Marketing edita (a direção é sempre gestão). O servidor
 * confere o papel em cada gravação (403); aqui a tela só não mostra o que a
 * pessoa não pode usar. Quem não é gestão vê uma frase dizendo isso.
 *
 * Nada aqui é regra fixa: canais, playbook e papéis são da casa. A carga
 * padrão é só o ponto de partida (a especificação do Léo), e apertar o botão
 * de novo não sobrescreve nada do que foi editado.
 *
 * Mora FORA do .config-editor dos atalhos do Drive de propósito: lá a regra
 * `.config-editor label` (mais específica) troca o tamanho e o peso de todo
 * rótulo `.label`, e os formulários da gaveta ficariam com outra cara.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import Gaveta from '../Gaveta.jsx';
import { IconeCanal, ICONES_CANAL, corDoCanal } from '../ChipCanal.jsx';
import { Selo } from '../lista.jsx';
import { CampoPessoa } from './FormAcao.jsx';
import { textoRecorrencia, TIPO_PLAYBOOK, RECORRENCIA, PRIORIDADE, EVIDENCIA } from './Detalhes.jsx';
import { mudouNoServidor } from './contexto.js';
import { nomeDoResponsavel, trocarPorId } from './derivar.js';
import { semContaNoPainel } from '../../lib/calc/marketing-conexoes.js';
import {
  lerPainelMarketing,
  listarPessoasMarketing,
  salvarCanal,
  salvarPlaybook,
  retirarPlaybook,
  definirPapel,
  carregarPadrao,
} from '../../services/marketing.js';
import { GRUPOS_CANAL, PAPEIS_MARKETING } from '../../../supabase/functions/_shared/marketing.mjs';
import { CANAIS as CANAIS_COMERCIAL } from '../../../supabase/functions/_shared/relacionamento-comercial.mjs';
import './marketing.css';

const GRUPO = { digital: 'Digital', contato: 'Contato direto', offline: 'Offline' };
const NOME_ICONE = {
  globe: 'Globo (site)',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  pin: 'Alfinete (Pinterest)',
  'map-pin': 'Marcador de mapa (Google)',
  'message-circle': 'Balão de conversa (WhatsApp)',
  phone: 'Telefone',
  mail: 'Envelope (e-mail)',
  handshake: 'Aperto de mão (visita)',
  megaphone: 'Megafone',
  youtube: 'YouTube',
  store: 'Loja',
};
export const NOME_PAPEL = { gestao: 'Gestão', marketing: 'Marketing', visualizacao: 'Visualização' };
const COR_VALIDA = /^#[0-9a-fA-F]{6}$/;

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome || a.titulo).localeCompare(String(b.nome || b.titulo), 'pt-BR');

function Erro({ texto }) {
  if (!texto) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
      {texto}
    </p>
  );
}

/* O aviso aparece na seção onde a pessoa mexeu (perto do botão que ela
   tocou), e não no topo do bloco, que no celular está várias telas acima. */
function AvisoLocal({ aviso, onde }) {
  if (!aviso || aviso.onde !== onde) return null;
  const erro = aviso.tom === 'erro';
  return (
    <p role={erro ? 'alert' : 'status'} className={`mt-3 rounded-xl px-4 py-3 text-sm ${erro ? 'bg-bad-50 text-bad-700' : 'bg-ok-50 text-ok-700'}`}>
      {aviso.texto}
    </p>
  );
}

function Titulo({ titulo, sub }) {
  return (
    <div className="mb-3">
      <h4 className="font-display text-base font-semibold text-slate-900">{titulo}</h4>
      {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

function Rodape({ id, salvando, novo, rotuloNovo, rotuloSalvar, onFechar }) {
  return (
    <>
      <button type="button" className="btn-ghost" disabled={salvando} onClick={onFechar}>
        Cancelar
      </button>
      <button type="submit" form={id} className="btn-primary" disabled={salvando}>
        {salvando ? 'Salvando...' : novo ? rotuloNovo : rotuloSalvar}
      </button>
    </>
  );
}

/* ------------------------------------------------------------ canal -- */

const ID_FORM_CANAL = 'form-canal-marketing';

function FormCanal({ canal, ordemNova, onSalvo, onMudou, onFechar }) {
  const novo = !canal;
  const [form, setForm] = useState(() =>
    novo
      ? {
          id: crypto.randomUUID(),
          nome: '',
          codigo: '',
          grupo: 'digital',
          icone: 'megaphone',
          cor: '#64748b',
          urlPerfil: '',
          urlGerenciador: '',
          mensagemWhatsapp: '',
          diasParado: '7',
          ativo: true,
          emImplantacao: false,
          comercialCanal: '',
          ordem: ordemNova,
        }
      : { ...canal, diasParado: String(canal.diasParado ?? 7), comercialCanal: canal.comercialCanal || '' }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const dados = {
        id: form.id,
        nome: form.nome,
        grupo: form.grupo,
        icone: form.icone,
        cor: String(form.cor).trim().toLowerCase(),
        urlPerfil: form.urlPerfil,
        urlGerenciador: form.urlGerenciador,
        mensagemWhatsapp: form.mensagemWhatsapp,
        diasParado: form.diasParado,
        ativo: !!form.ativo,
        emImplantacao: !!form.emImplantacao,
        comercialCanal: form.comercialCanal || null,
        ordem: form.ordem,
      };
      // O código só vai na criação (vazio: o servidor gera do nome). Depois
      // ele não muda: é o endereço do chip e a chave da carga padrão.
      if (novo && form.codigo.trim()) dados.codigo = form.codigo.trim().toLowerCase();
      const salvo = await salvarCanal(dados, novo ? undefined : canal.versao, novo);
      onSalvo(salvo, novo);
    } catch (err) {
      if (mudouNoServidor(err)) onMudou(err);
      else setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      aberta
      titulo={novo ? 'Novo canal' : `Canal · ${canal.nome}`}
      onFechar={onFechar}
      ocupado={salvando}
      rodape={<Rodape id={ID_FORM_CANAL} salvando={salvando} novo={novo} rotuloNovo="Criar canal" rotuloSalvar="Salvar canal" onFechar={onFechar} />}
    >
      <form id={ID_FORM_CANAL} onSubmit={salvar} className="space-y-4">
        <Erro texto={erro} />
        <fieldset disabled={salvando} className="min-w-0 space-y-4 border-0 p-0">
          <label className="label">
            Nome
            <input className="input" required maxLength={60} value={form.nome} onChange={campo('nome')} />
          </label>
          {novo ? (
            <label className="label">
              Código (opcional)
              <input className="input" maxLength={30} placeholder="Gerado do nome" value={form.codigo} onChange={campo('codigo')} />
              <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">
                Letras minúsculas, números, - ou _. Vai no endereço da página e não muda depois de criado.
              </small>
            </label>
          ) : (
            <p className="text-sm text-slate-500">Código: {canal.codigo} (não muda)</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Grupo
              <select className="input" value={form.grupo} onChange={campo('grupo')}>
                {GRUPOS_CANAL.map((g) => (
                  <option key={g} value={g}>
                    {GRUPO[g] || g}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Ícone
              <span className="mt-0 flex items-center gap-2">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border text-slate-700" style={{ borderColor: 'var(--hairline)' }}>
                  <IconeCanal nome={form.icone} size={18} />
                </span>
                <select className="input" value={form.icone} onChange={campo('icone')}>
                  {Object.keys(ICONES_CANAL).map((k) => (
                    <option key={k} value={k}>
                      {NOME_ICONE[k] || k}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
          <label className="label">
            Cor
            <span className="flex items-center gap-2">
              <input
                type="color"
                className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
                style={{ borderColor: 'var(--hairline)' }}
                aria-label="Escolher a cor"
                value={COR_VALIDA.test(form.cor) ? String(form.cor).toLowerCase() : '#000000'}
                onChange={campo('cor')}
              />
              <input className="input" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={form.cor} onChange={campo('cor')} />
            </span>
            <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Aparece como um fio no chip e como ponto nas tarefas, nunca como fundo.</small>
          </label>
          <label className="label">
            Link do perfil
            <input className="input" type="url" maxLength={500} placeholder="https://" value={form.urlPerfil} onChange={campo('urlPerfil')} />
          </label>
          <label className="label">
            Link do gerenciador
            <input className="input" type="url" maxLength={500} placeholder="https://" value={form.urlGerenciador} onChange={campo('urlGerenciador')} />
          </label>
          <label className="label">
            Mensagem do WhatsApp
            <textarea className="input min-h-20" maxLength={300} value={form.mensagemWhatsapp} onChange={campo('mensagemWhatsapp')} />
            <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">O atalho "Copiar link do WhatsApp" do canal leva esta mensagem já escrita e abre a conversa com o número do canal WhatsApp (o Link do perfil dele: https://wa.me/ seguido de 55, DDD e número, só dígitos). Sem esse número, o atalho não aparece.</small>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Dias sem publicação para ficar parado
              <input className="input" type="number" min={1} max={90} required value={form.diasParado} onChange={campo('diasParado')} />
              <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Só vale para canal do grupo digital: contato direto e offline não publicam.</small>
            </label>
            <label className="label">
              Canal do Comercial
              <select className="input" value={form.comercialCanal} onChange={campo('comercialCanal')}>
                <option value="">Nenhum</option>
                {Object.entries(CANAIS_COMERCIAL).map(([k, nome]) => (
                  <option key={k} value={k}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" className="h-5 w-5" checked={!!form.ativo} onChange={campo('ativo')} />
            Ativo (aparece na fileira de chips)
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" className="h-5 w-5" checked={!!form.emImplantacao} onChange={campo('emImplantacao')} />
            Em implantação (o checklist de implantação aparece primeiro no canal)
          </label>
        </fieldset>
      </form>
    </Gaveta>
  );
}

/* ------------------------------------------------------ item do playbook -- */

const ID_FORM_ITEM = 'form-playbook-marketing';

function FormItem({ item, canais, canalPadrao, ordemNova, gatilhos, pessoas, erroPessoas, recarregarPessoas, onSalvo, onMudou, onFechar }) {
  const novo = !item;
  const [form, setForm] = useState(() =>
    novo
      ? {
          id: crypto.randomUUID(),
          canalId: canalPadrao || '',
          tipo: 'unica',
          titulo: '',
          instrucao: '',
          responsavelId: '',
          recorrencia: 'semanal',
          aCadaDias: '',
          metaQuantidade: '1',
          prazoDias: '',
          prioridade: 'media',
          evidencia: 'nenhuma',
          gatilho: '',
          implantacao: false,
          checklistTexto: '',
          ordem: String(ordemNova),
        }
      : {
          ...item,
          responsavelId: item.responsavelId || '',
          recorrencia: item.recorrencia || 'semanal',
          aCadaDias: item.aCadaDias == null ? '' : String(item.aCadaDias),
          metaQuantidade: item.metaQuantidade == null ? '1' : String(item.metaQuantidade),
          prazoDias: item.prazoDias == null ? '' : String(item.prazoDias),
          gatilho: item.gatilho || '',
          checklistTexto: (item.checklist || []).join('\n'),
          ordem: String(item.ordem ?? 0),
        }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const rotina = form.tipo === 'rotina';
  const gatilho = form.tipo === 'gatilho';
  const opcoesCanal = canais.filter((c) => c.ativo || c.emImplantacao || c.id === form.canalId);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    const checklist = form.checklistTexto
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (checklist.length > 30) return setErro('O checklist vai até 30 itens.');
    setSalvando(true);
    try {
      const dados = {
        id: form.id,
        canalId: form.canalId,
        tipo: form.tipo,
        titulo: form.titulo,
        instrucao: form.instrucao,
        responsavelId: form.responsavelId || null,
        recorrencia: rotina ? form.recorrencia : null,
        aCadaDias: rotina && form.recorrencia === 'cada_n_dias' ? form.aCadaDias : null,
        metaQuantidade: rotina ? form.metaQuantidade : null,
        prazoDias: form.prazoDias === '' ? null : form.prazoDias,
        prioridade: form.prioridade,
        evidencia: form.evidencia,
        gatilho: gatilho ? form.gatilho : null,
        implantacao: form.tipo === 'unica' && !!form.implantacao,
        checklist,
        ordem: form.ordem === '' ? 0 : form.ordem,
      };
      const salvo = await salvarPlaybook(dados, novo ? undefined : item.versao, novo);
      onSalvo(salvo, novo);
    } catch (err) {
      if (mudouNoServidor(err)) onMudou(err);
      else setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      aberta
      titulo={novo ? 'Novo item do playbook' : 'Item do playbook'}
      onFechar={onFechar}
      ocupado={salvando}
      rodape={<Rodape id={ID_FORM_ITEM} salvando={salvando} novo={novo} rotuloNovo="Criar item" rotuloSalvar="Salvar item" onFechar={onFechar} />}
    >
      <form id={ID_FORM_ITEM} onSubmit={salvar} className="space-y-4">
        <Erro texto={erro} />
        <fieldset disabled={salvando} className="min-w-0 space-y-4 border-0 p-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Canal
              <select className="input" required value={form.canalId} onChange={campo('canalId')}>
                <option value="">Escolha o canal</option>
                {opcoesCanal.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Tipo
              <select className="input" value={form.tipo} onChange={campo('tipo')}>
                {Object.entries(TIPO_PLAYBOOK).map(([k, nome]) => (
                  <option key={k} value={k}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="label">
            Título
            <input className="input" required maxLength={160} value={form.titulo} onChange={campo('titulo')} />
          </label>
          <label className="label">
            Como fazer
            <textarea className="input min-h-24" maxLength={2000} value={form.instrucao} onChange={campo('instrucao')} />
          </label>
          <CampoPessoa
            rotulo="Responsável padrão"
            valor={form.responsavelId}
            pessoas={pessoas}
            erroPessoas={erroPessoas}
            recarregarPessoas={recarregarPessoas}
            onChange={(v) => setForm((f) => ({ ...f, responsavelId: v }))}
          />
          {rotina && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                Recorrência
                <select className="input" value={form.recorrencia} onChange={campo('recorrencia')}>
                  {Object.entries(RECORRENCIA).map(([k, nome]) => (
                    <option key={k} value={k}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
              {form.recorrencia === 'cada_n_dias' && (
                <label className="label">
                  A cada quantos dias
                  <input className="input" type="number" min={1} max={365} required value={form.aCadaDias} onChange={campo('aCadaDias')} />
                </label>
              )}
              <label className="label">
                Meta por período
                <input className="input" type="number" min={1} max={999} value={form.metaQuantidade} onChange={campo('metaQuantidade')} />
              </label>
            </div>
          )}
          {gatilho && (
            <label className="label">
              Evento que dispara
              <input className="input" required maxLength={60} list="gatilhos-marketing" value={form.gatilho} onChange={campo('gatilho')} />
              <datalist id="gatilhos-marketing">
                {gatilhos.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <small className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Os gatilhos passam a gerar tarefa quando a etapa deles chegar.</small>
            </label>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="label">
              Prazo em dias
              <input className="input" type="number" min={0} max={365} value={form.prazoDias} onChange={campo('prazoDias')} />
            </label>
            <label className="label">
              Prioridade
              <select className="input" value={form.prioridade} onChange={campo('prioridade')}>
                {Object.entries(PRIORIDADE).map(([k, nome]) => (
                  <option key={k} value={k}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Evidência
              <select className="input" value={form.evidencia} onChange={campo('evidencia')}>
                {Object.entries(EVIDENCIA).map(([k, nome]) => (
                  <option key={k} value={k}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="label">
            Checklist (um por linha)
            <textarea className="input min-h-24" value={form.checklistTexto} onChange={campo('checklistTexto')} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Ordem
              <input className="input" type="number" min={0} max={9999} value={form.ordem} onChange={campo('ordem')} />
            </label>
            {form.tipo === 'unica' && (
              <label className="flex min-h-11 items-center gap-3 self-end text-sm text-slate-700">
                <input type="checkbox" className="h-5 w-5" checked={!!form.implantacao} onChange={campo('implantacao')} />
                Passo da implantação do canal
              </label>
            )}
          </div>
        </fieldset>
      </form>
    </Gaveta>
  );
}

/* ------------------------------------------------------------ seções -- */

function SecaoCanais({ canais, ocupado, aviso, onNovo, onEditar, onMover }) {
  return (
    <section>
      <Titulo titulo="Canais" sub="Cada canal ativo é um chip na página Marketing, nesta ordem. Desativar tira o chip sem apagar o histórico." />
      {canais.length === 0 ? (
        <p className="config-aviso">Nenhum canal ainda. Use "Carregar canais e playbook padrão" logo abaixo ou crie o primeiro.</p>
      ) : (
        <ul>
          {canais.map((c, i) => {
            const cor = corDoCanal(c);
            return (
              <li key={c.id} className="mkt-linha flex-wrap">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border" style={{ borderColor: cor || 'var(--hairline)', color: cor || undefined }}>
                  <IconeCanal nome={c.icone} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{c.nome}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {GRUPO[c.grupo] || c.grupo}
                    {c.grupo === 'digital' ? ` · fica parado depois de ${c.diasParado} ${c.diasParado === 1 ? 'dia' : 'dias'} sem publicação` : ''}
                  </span>
                </span>
                {!c.ativo && <Selo tom="neutral">Desativado</Selo>}
                {c.emImplantacao && <Selo tom="warn">Em implantação</Selo>}
                <span className="flex shrink-0 items-center">
                  <button type="button" className="btn-ghost h-11 w-11 p-0" disabled={ocupado || i === 0} onClick={() => onMover(i, -1)} aria-label={`Subir ${c.nome}`}>
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost h-11 w-11 p-0"
                    disabled={ocupado || i === canais.length - 1}
                    onClick={() => onMover(i, 1)}
                    aria-label={`Descer ${c.nome}`}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn-outline min-h-11" disabled={ocupado} onClick={() => onEditar(c)}>
                    Editar
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <AvisoLocal aviso={aviso} onde="canais" />
      <button type="button" className="btn-outline mt-3 min-h-11" disabled={ocupado} onClick={onNovo}>
        <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
        Novo canal
      </button>
    </section>
  );
}

function detalheDoItem(i) {
  if (i.tipo === 'rotina') return textoRecorrencia(i);
  if (i.tipo === 'gatilho') return `Quando: ${i.gatilho || 'evento não informado'}`;
  return i.implantacao ? 'Passo da implantação' : `Prioridade ${String(PRIORIDADE[i.prioridade] || i.prioridade).toLocaleLowerCase('pt-BR')}`;
}

function SecaoPlaybook({ canais, playbook, canalId, onCanal, pessoas, ocupado, aviso, onNovo, onEditar, onRetirar, onVoltar }) {
  const doCanal = playbook.filter((i) => i.canalId === canalId).sort(porOrdem);
  const ativos = doCanal.filter((i) => i.ativo !== false);
  const retirados = doCanal.filter((i) => i.ativo === false);
  return (
    <section>
      <Titulo titulo="Playbook por canal" sub="O que se faz em cada canal: ações únicas, rotinas e gatilhos. As rotinas entram na agenda na próxima etapa." />
      {canais.length === 0 ? (
        <p className="config-aviso">Cadastre um canal primeiro.</p>
      ) : (
        <>
          <label className="label max-w-sm">
            Canal
            <select className="input" value={canalId} onChange={(e) => onCanal(e.target.value)}>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {!c.ativo && !c.emImplantacao ? ' (desativado)' : ''}
                </option>
              ))}
            </select>
          </label>
          {ativos.length === 0 ? (
            <p className="config-aviso mt-3">Nenhum item no playbook deste canal.</p>
          ) : (
            <ul className="mt-3">
              {ativos.map((i) => {
                const nome = nomeDoResponsavel({ responsavelId: i.responsavelId }, pessoas);
                return (
                  <li key={i.id} className="mkt-linha flex-wrap">
                    <Selo tom={i.tipo === 'unica' ? 'brand' : i.tipo === 'rotina' ? 'ok' : 'warn'}>{TIPO_PLAYBOOK[i.tipo] || i.tipo}</Selo>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{i.titulo}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {detalheDoItem(i)}
                        {nome ? ` · ${nome}` : ''}
                        {i.tipo === 'unica' && i.concluidoEm ? ' · feito' : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" className="btn-outline min-h-11" disabled={ocupado} onClick={() => onEditar(i)}>
                        Editar
                      </button>
                      <button type="button" className="btn-ghost min-h-11 text-bad-700" disabled={ocupado} onClick={() => onRetirar(i)}>
                        Retirar
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {retirados.length > 0 && (
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-slate-600">Retirados deste canal ({retirados.length})</summary>
              <ul>
                {retirados.map((i) => (
                  <li key={i.id} className="mkt-linha">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{i.titulo}</span>
                    <button type="button" className="btn-ghost min-h-11" disabled={ocupado} onClick={() => onVoltar(i)}>
                      Voltar ao playbook
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <AvisoLocal aviso={aviso} onde="playbook" />
          <button type="button" className="btn-outline mt-3 min-h-11" disabled={ocupado} onClick={onNovo}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Adicionar item
          </button>
        </>
      )}
    </section>
  );
}

/* PESSOA SEM CONTA NO PAINEL (campo temContaPainel da ação "pessoas"): o
   papel fica gravado, mas só vale quando ela tiver um login ligado a ela. O
   aviso só aparece quando o servidor disse que não tem; sem o campo (função
   antiga), nada é dito. */
const SEM_CONTA = 'Sem conta no Painel: o papel só vale quando ela tiver conta.';

function SecaoPapeis({ papeis, pessoas, erroPessoas, recarregarPessoas, ocupado, aviso, onDefinir }) {
  const [novoId, setNovoId] = useState('');
  const [novoPapel, setNovoPapel] = useState('marketing');
  const linhas = useMemo(
    () =>
      papeis
        .map((p) => ({
          ...p,
          nome: Array.isArray(pessoas) ? nomeDoResponsavel({ responsavelId: p.idPessoa }, pessoas) : 'Carregando...',
          semConta: semContaNoPainel(pessoas, p.idPessoa),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [papeis, pessoas]
  );
  return (
    <section>
      <Titulo
        titulo="Papéis no Marketing"
        sub="Sem papel definido, quem tem o módulo Marketing trabalha como marketing (vê e grava ações, publicações e números). Visualização só vê. Gestão também edita canais, playbook e papéis. A direção é sempre gestão."
      />
      {linhas.length === 0 ? (
        <p className="config-aviso">Ninguém com papel definido: todos com o módulo trabalham como marketing.</p>
      ) : (
        <ul>
          {linhas.map((p) => (
            <li key={p.idPessoa} className="mkt-linha flex-wrap">
              {/* Pelo menos 10rem para o nome (e o aviso embaixo dele): no
                  celular o papel e o "Voltar ao padrão" descem para a linha
                  de baixo, em vez de espremer o nome até sumir. */}
              <span className="min-w-[10rem] flex-1">
                <span className="block truncate text-sm text-slate-800">{p.nome}</span>
                {p.semConta && <span className="block text-xs text-warn-700">{SEM_CONTA}</span>}
              </span>
              <select
                className="input w-auto"
                aria-label={`Papel de ${p.nome}`}
                disabled={ocupado}
                value={p.papel}
                onChange={(e) => onDefinir(p.idPessoa, e.target.value)}
              >
                {PAPEIS_MARKETING.map((k) => (
                  <option key={k} value={k}>
                    {NOME_PAPEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost min-h-11" disabled={ocupado} onClick={() => onDefinir(p.idPessoa, null)}>
                Voltar ao padrão
              </button>
            </li>
          ))}
        </ul>
      )}
      <AvisoLocal aviso={aviso} onde="papeis" />
      <form
        className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!novoId) return;
          if (await onDefinir(novoId, novoPapel)) setNovoId('');
        }}
      >
        <CampoPessoa rotulo="Pessoa" valor={novoId} pessoas={pessoas} erroPessoas={erroPessoas} recarregarPessoas={recarregarPessoas} onChange={setNovoId} />
        <label className="label">
          Papel
          <select className="input" value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)}>
            {PAPEIS_MARKETING.map((k) => (
              <option key={k} value={k}>
                {NOME_PAPEL[k]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary min-h-11" disabled={ocupado || !novoId}>
          Definir papel
        </button>
        {semContaNoPainel(pessoas, novoId) && (
          <p role="status" className="text-xs text-warn-700 sm:col-span-3">
            {SEM_CONTA}
          </p>
        )}
      </form>
    </section>
  );
}

/* ---------------------------------------------------------- principal -- */

export default function ConfigCentroMarketing() {
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [pessoas, setPessoas] = useState(null);
  const [erroPessoas, setErroPessoas] = useState('');
  const [aviso, setAviso] = useState(null);
  const [gaveta, setGaveta] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [canalPlaybook, setCanalPlaybook] = useState('');
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await lerPainelMarketing();
      if (!Array.isArray(r?.canais) || !Array.isArray(r?.playbook)) throw new Error('O servidor do Marketing ainda está na versão anterior. Tente de novo em alguns minutos.');
      if (!vivo.current) return;
      setPainel({ papel: r.papel, canais: [...r.canais].sort(porOrdem), playbook: r.playbook, papeis: Array.isArray(r.papeis) ? r.papeis : [] });
      setErro('');
    } catch (e) {
      if (vivo.current) setErro(e?.message || 'Não foi possível ler os canais.');
    }
  }, []);
  const carregarPessoas = useCallback(async () => {
    setErroPessoas('');
    try {
      const r = await listarPessoasMarketing();
      if (vivo.current) setPessoas(Array.isArray(r.pessoas) ? r.pessoas : []);
    } catch (e) {
      if (vivo.current) setErroPessoas(e?.message || 'Não foi possível ler as pessoas.');
    }
  }, []);
  useEffect(() => {
    carregar();
    carregarPessoas();
  }, [carregar, carregarPessoas]);

  const canais = painel?.canais || [];
  const canalEscolhido = canais.some((c) => c.id === canalPlaybook) ? canalPlaybook : canais[0]?.id || '';
  const gatilhos = useMemo(
    () => [...new Set(['avaliacao_nova', ...(painel?.playbook || []).map((i) => i.gatilho).filter(Boolean)])].sort(),
    [painel]
  );

  const avisar = (texto, tom = 'ok', onde = 'canais') => setAviso({ texto, tom, onde });
  const fechar = () => setGaveta(null);
  const mudou = (onde) => async (err) => {
    setGaveta(null);
    await carregar();
    avisar(`${err.message} A lista foi atualizada.`, 'erro', onde);
  };

  function canalSalvo(c, novo) {
    setPainel((p) => ({ ...p, canais: trocarPorId(p.canais, c).sort(porOrdem) }));
    setGaveta(null);
    avisar(novo ? `Canal "${c.nome}" criado.` : `Canal "${c.nome}" salvo.`);
  }
  function itemSalvo(i, novo) {
    setPainel((p) => ({ ...p, playbook: trocarPorId(p.playbook, i) }));
    setCanalPlaybook(i.canalId);
    setGaveta(null);
    avisar(novo ? `Item "${i.titulo}" criado.` : `Item "${i.titulo}" salvo.`, 'ok', 'playbook');
  }

  /* Subir e descer: a lista nova é renumerada de 10 em 10 e só vai ao
     servidor o canal cuja ordem mudou (um pedido por canal, com a versão
     dele). No meio de uma falha, a lista é relida em vez de ficar meio
     trocada na tela. */
  async function mover(indice, delta) {
    const lista = [...canais];
    const j = indice + delta;
    if (j < 0 || j >= lista.length) return;
    [lista[indice], lista[j]] = [lista[j], lista[indice]];
    setOcupado(true);
    setAviso(null);
    try {
      for (let n = 0; n < lista.length; n++) {
        const c = lista[n];
        const ordem = (n + 1) * 10;
        if (Number(c.ordem) === ordem) continue;
        const salvo = await salvarCanal({ id: c.id, ordem }, c.versao);
        if (vivo.current) setPainel((p) => ({ ...p, canais: trocarPorId(p.canais, salvo).sort(porOrdem) }));
      }
    } catch (e) {
      await carregar();
      avisar(`A ordem não foi salva inteira: ${e.message} A lista foi relida.`, 'erro');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function retirar(i) {
    if (!window.confirm(`Retirar "${i.titulo}" do playbook? O item sai da lista do canal e o histórico fica guardado. Dá para voltar depois.`)) return;
    setOcupado(true);
    setAviso(null);
    try {
      await retirarPlaybook(i.id, i.versao);
      await carregar();
      avisar(`"${i.titulo}" saiu do playbook.`, 'ok', 'playbook');
    } catch (e) {
      if (mudouNoServidor(e)) await carregar();
      avisar(e.message, 'erro', 'playbook');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function voltar(i) {
    setOcupado(true);
    setAviso(null);
    try {
      const salvo = await salvarPlaybook({ id: i.id, ativo: true }, i.versao);
      setPainel((p) => ({ ...p, playbook: trocarPorId(p.playbook, salvo) }));
      avisar(`"${i.titulo}" voltou ao playbook.`, 'ok', 'playbook');
    } catch (e) {
      if (mudouNoServidor(e)) await carregar();
      avisar(e.message, 'erro', 'playbook');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function papel(idPessoa, escolhido) {
    setOcupado(true);
    setAviso(null);
    try {
      await definirPapel(idPessoa, escolhido);
      setPainel((p) => ({
        ...p,
        papeis:
          escolhido === null
            ? p.papeis.filter((x) => x.idPessoa !== idPessoa)
            : [...p.papeis.filter((x) => x.idPessoa !== idPessoa), { idPessoa, papel: escolhido, definidoPor: null, definidoEm: new Date().toISOString() }],
      }));
      avisar(escolhido === null ? 'Papel removido: a pessoa volta ao padrão (marketing).' : `Papel definido: ${NOME_PAPEL[escolhido]}.`, 'ok', 'papeis');
      return true;
    } catch (e) {
      avisar(e.message, 'erro', 'papeis');
      return false;
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function carga() {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await carregarPadrao();
      await carregar();
      const c = Number(r.canais) || 0;
      const i = Number(r.itens) || 0;
      avisar(
        c || i
          ? `Entraram ${c} ${c === 1 ? 'canal' : 'canais'} e ${i} ${i === 1 ? 'item' : 'itens'} do playbook. O que já existia ficou como estava.`
          : 'Nada novo: os canais e o playbook padrão já estavam todos cadastrados. Nada do que foi editado mudou.',
        'ok',
        'carga'
      );
    } catch (e) {
      avisar(e.message, 'erro', 'carga');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  if (erro && !painel) {
    return (
      <div className="mt-8 border-t pt-6" style={{ borderColor: 'var(--hairline)' }}>
        <p role="alert" className="rounded-xl bg-bad-50 px-4 py-3 text-sm text-bad-700">
          Canais e playbook do Marketing não carregaram: {erro}{' '}
          <button type="button" className="btn-ghost min-h-11" onClick={carregar}>
            Tentar de novo
          </button>
        </p>
      </div>
    );
  }
  if (!painel) {
    return (
      <p role="status" className="config-aviso mt-8">
        Carregando canais e playbook do Marketing...
      </p>
    );
  }
  if (painel.papel !== 'gestao') {
    return <p className="config-aviso mt-8">Canais, playbook e papéis do Marketing são editados pela gestão do Marketing. A direção é sempre gestão.</p>;
  }

  const itensDoCanal = painel.playbook.filter((i) => i.canalId === canalEscolhido);
  const ordemNovaItem = itensDoCanal.reduce((m, i) => Math.max(m, Number(i.ordem) || 0), 0) + 10;
  const ordemNovaCanal = canais.reduce((m, c) => Math.max(m, Number(c.ordem) || 0), 0) + 10;

  return (
    <>
      <div className="mt-8 space-y-8 border-t pt-6" style={{ borderColor: 'var(--hairline)' }}>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Centro de Comando do Marketing</h3>
          <p className="mt-0.5 text-sm text-slate-500">Canais, playbook e papéis. Só a gestão vê esta parte.</p>
        </div>
        {erro && (
          <p role="alert" className="rounded-xl bg-warn-50 px-4 py-3 text-sm text-warn-700">
            Não foi possível atualizar: {erro}
          </p>
        )}

        <SecaoCanais
          canais={canais}
          ocupado={ocupado}
          aviso={aviso}
          onNovo={() => setGaveta({ tipo: 'canal', n: Date.now() })}
          onEditar={(c) => setGaveta({ tipo: 'canal', canal: c, n: Date.now() })}
          onMover={mover}
        />
        <SecaoPlaybook
          canais={canais}
          playbook={painel.playbook}
          canalId={canalEscolhido}
          onCanal={setCanalPlaybook}
          pessoas={pessoas}
          ocupado={ocupado}
          aviso={aviso}
          onNovo={() => setGaveta({ tipo: 'item', n: Date.now() })}
          onEditar={(i) => setGaveta({ tipo: 'item', item: i, n: Date.now() })}
          onRetirar={retirar}
          onVoltar={voltar}
        />
        <SecaoPapeis papeis={painel.papeis} pessoas={pessoas} erroPessoas={erroPessoas} recarregarPessoas={carregarPessoas} ocupado={ocupado} aviso={aviso} onDefinir={papel} />

        <section>
          <Titulo
            titulo="Carga padrão"
            sub="Os canais e o playbook da especificação, como ponto de partida. Pode apertar de novo: só entra o que falta, e nada do que foi editado aqui é sobrescrito."
          />
          <button type="button" className="btn-outline min-h-11" disabled={ocupado} onClick={carga}>
            {ocupado ? 'Aguarde...' : 'Carregar canais e playbook padrão'}
          </button>
          <AvisoLocal aviso={aviso} onde="carga" />
        </section>
      </div>

      {/* As gavetas ficam FORA do space-y: o margin-top que ele dá a todo
          irmão empurrava o <dialog> para baixo da tela. */}
      {gaveta?.tipo === 'canal' && (
        <FormCanal key={gaveta.n} canal={gaveta.canal || null} ordemNova={ordemNovaCanal} onSalvo={canalSalvo} onMudou={mudou('canais')} onFechar={fechar} />
      )}
      {gaveta?.tipo === 'item' && (
        <FormItem
          key={gaveta.n}
          item={gaveta.item || null}
          canais={canais}
          canalPadrao={canalEscolhido}
          ordemNova={ordemNovaItem}
          gatilhos={gatilhos}
          pessoas={pessoas}
          erroPessoas={erroPessoas}
          recarregarPessoas={carregarPessoas}
          onSalvo={itemSalvo}
          onMudou={mudou('playbook')}
          onFechar={fechar}
        />
      )}
    </>
  );
}

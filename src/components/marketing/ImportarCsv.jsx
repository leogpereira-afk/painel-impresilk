/* IMPORTAR PUBLICAÇÕES POR CSV, na Gaveta. Três passos, nesta ordem:
 *  1. escolher o arquivo: ele é lido AQUI, no aparelho (textoDoArquivo
 *     entende UTF-8 e o Windows-1252 do Excel antigo), e nada vai ao
 *     servidor ainda;
 *  2. a prévia: quantas linhas entram, quais ficam de fora e por quê, e as
 *     colunas que o leitor não conhece (ignoradas, não erro);
 *  3. importar: só as linhas boas vão. O servidor confere tudo de novo
 *     (prepararLinhaCsv) e responde quantas entraram, quantas atualizaram uma
 *     publicação que já existia (mesmo link no mesmo canal), quantas eram
 *     iguais e quais ele recusou, com o motivo.
 *
 * Célula vazia é "não informado" e nunca vira zero, nem apaga o número que já
 * estava gravado. Importado de dentro de um canal, a linha sem a coluna
 * "canal" (ou com a célula vazia) entra nele.
 */
import { useState } from 'react';
import { Download } from 'lucide-react';
import Gaveta from '../Gaveta.jsx';
import { useMarketing } from './contexto.js';
import { LIMITE_LINHAS_CSV, lerCsvPublicacoes, textoDoArquivo } from '../../lib/calc/marketing-csv.js';
import { importarPublicacoes } from '../../services/marketing.js';
import { dataLonga, numero, numeroCompacto } from '../../lib/format.js';

// Um CSV de 2.000 linhas tem uns 300 KB. Arquivo bem maior que isso é
// planilha errada (ou exportação com colunas demais), e ler tudo trava o
// celular antes de dizer qualquer coisa.
const MAX_BYTES = 2 * 1024 * 1024;
const MOSTRAR = 20;

/** O modelo para baixar: o cabeçalho que o leitor entende e uma linha de
 *  exemplo com o código do canal e a data de hoje (data no futuro o leitor
 *  recusa, e o modelo não pode nascer recusado). */
function baixarModelo(codigo, hoje) {
  const [ano, mes, dia] = String(hoje).split('-');
  const texto = [
    'canal;data;titulo;link;alcance;impressoes;engajamento;cliques;leads',
    `${codigo || 'instagram'};${dia}/${mes}/${ano};Reel da fachada (exemplo);https://www.instagram.com/p/EXEMPLO;1.234;2.500;87;;2`,
  ].join('\r\n');
  // O BOM no começo faz o Excel abrir os acentos certos.
  const blob = new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-publicacoes.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function numerosDaLinha(l) {
  const partes = [
    ['alcance', 'alcance'],
    ['impressoes', 'impressões'],
    ['engajamento', 'engajamento'],
    ['cliques', 'cliques'],
    ['leads', 'leads'],
  ]
    .filter(([k]) => l[k] != null)
    .map(([k, r]) => `${numeroCompacto(l[k])} ${r}`);
  return partes.length ? partes.join(' · ') : 'sem números';
}

export default function ImportarCsv({ canalId = '', onFechar }) {
  const { painel, hoje, podeGravar, canaisPorId, recarregar, avisar } = useMarketing();
  const canal = canalId ? canaisPorId.get(canalId) : null;
  const [arquivo, setArquivo] = useState('');
  const [previa, setPrevia] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  async function escolher(e) {
    const input = e.target;
    const file = input.files?.[0];
    setPrevia(null);
    setResultado(null);
    setErro('');
    setArquivo('');
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErro('Arquivo acima de 2 MB. Deixe só as colunas de publicação e no máximo 2.000 linhas por vez.');
      return;
    }
    setLendo(true);
    try {
      const texto = textoDoArquivo(new Uint8Array(await file.arrayBuffer()));
      setPrevia(lerCsvPublicacoes(texto, painel.canais, { canalId: canalId || null, hoje }));
      setArquivo(file.name);
    } catch (err) {
      setErro(`Não foi possível ler o arquivo: ${err?.message || 'formato desconhecido'}.`);
    } finally {
      setLendo(false);
      // Escolher de novo o MESMO arquivo (corrigido no Excel e salvo com o
      // mesmo nome) não dispara change se o valor ficar: a prévia velha
      // ficava e o Importar mandava as linhas antigas.
      input.value = '';
    }
  }

  async function importar() {
    if (!previa?.linhas.length || !podeGravar) return;
    setErro('');
    setEnviando(true);
    try {
      const r = await importarPublicacoes(previa.linhas);
      setResultado(r);
      // A resposta só traz as contas; as publicações novas vêm da releitura.
      await recarregar();
      const entraram = (r.inseridas || 0) + (r.atualizadas || 0);
      avisar(entraram ? `Importação feita: ${numero(r.inseridas || 0)} novas e ${numero(r.atualizadas || 0)} atualizadas.` : 'Importação feita: nenhuma publicação mudou.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const ocupado = lendo || enviando;
  const prontas = previa?.linhas.length || 0;
  const rodape = resultado ? (
    <button type="button" className="btn-primary" onClick={onFechar}>
      Fechar
    </button>
  ) : (
    <>
      <button type="button" className="btn-ghost" disabled={enviando} onClick={onFechar}>
        Cancelar
      </button>
      {podeGravar && (
        <button type="button" className="btn-primary" disabled={!prontas || ocupado} onClick={importar}>
          {enviando ? 'Importando...' : prontas ? `Importar ${numero(prontas)} ${prontas === 1 ? 'publicação' : 'publicações'}` : 'Importar'}
        </button>
      )}
    </>
  );

  return (
    <Gaveta aberta titulo={canal ? `Importar CSV · ${canal.nome}` : 'Importar CSV'} onFechar={onFechar} rodape={rodape} ocupado={enviando}>
      <div className="space-y-4">
        {!podeGravar && <p className="rounded-lg bg-warn-50 p-3 text-sm text-warn-700">Seu papel no Marketing é só de visualização: dá para ver a prévia, mas não importar.</p>}

        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Colunas: canal, data, titulo, link, alcance, impressoes, engajamento, cliques e leads, separadas por ponto e vírgula ou vírgula. Toda linha precisa da
            data{canal ? '' : ' e do canal'}. Data em dd/mm/aaaa; números como 1.234.
          </p>
          <p>Célula vazia fica sem número (não vira zero). O mesmo link no mesmo canal atualiza a publicação em vez de duplicar. Até {numero(LIMITE_LINHAS_CSV)} linhas por vez.</p>
          {canal && <p>Linha sem canal entra em {canal.nome}.</p>}
          <button type="button" className="btn-ghost min-h-11 px-2" onClick={() => baixarModelo(canal?.codigo || painel.canais[0]?.codigo, hoje)}>
            <Download size={16} aria-hidden="true" />
            Baixar modelo
          </button>
        </div>

        {!resultado && (
          <label className="label">
            Arquivo CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="input file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
              disabled={ocupado}
              onChange={escolher}
            />
          </label>
        )}
        {lendo && <p role="status" className="text-sm text-slate-500">Lendo o arquivo...</p>}
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-50 p-3 text-sm text-bad-700">
            {erro}
          </p>
        )}

        {previa && !resultado && (
          <section aria-label="Prévia da importação" className="space-y-3">
            <p className={`rounded-lg p-3 text-sm ${prontas ? 'bg-ok-50 text-ok-700' : 'bg-warn-50 text-warn-700'}`}>
              {arquivo}: {prontas ? `${numero(prontas)} ${prontas === 1 ? 'linha pronta' : 'linhas prontas'} para entrar.` : 'nenhuma linha pronta para entrar.'}
              {previa.erros.length > 0 && ` ${numero(previa.erros.length)} ${previa.erros.length === 1 ? 'fica' : 'ficam'} de fora (veja abaixo).`}
            </p>
            {previa.ignoradas.length > 0 && <p className="text-sm text-slate-500">Colunas ignoradas: {previa.ignoradas.join(', ')}.</p>}
            {previa.erros.length > 0 && (
              <div>
                <h3 className="label">Ficam de fora</h3>
                <ul className="space-y-1 text-sm text-bad-700">
                  {previa.erros.map((x, n) => (
                    <li key={n}>
                      Linha {x.linha}: {x.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {prontas > 0 && (
              <div>
                <h3 className="label">Entram {prontas > MOSTRAR ? `(as ${MOSTRAR} primeiras de ${numero(prontas)})` : ''}</h3>
                <ul>
                  {previa.linhas.slice(0, MOSTRAR).map((l) => (
                    <li key={l.linha} className="mkt-linha text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800">{l.titulo || l.url || 'Sem título'}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {dataLonga(l.data)} · {canaisPorId.get(l.canalId)?.nome || 'Canal'} · {numerosDaLinha(l)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {resultado && (
          <section aria-label="Resultado da importação" className="space-y-3">
            <p role="status" className="rounded-lg bg-ok-50 p-3 text-sm text-ok-700">
              {numero(resultado.inseridas || 0)} {resultado.inseridas === 1 ? 'nova' : 'novas'}, {numero(resultado.atualizadas || 0)}{' '}
              {resultado.atualizadas === 1 ? 'atualizada' : 'atualizadas'} e {numero(resultado.iguais || 0)} sem mudança.
            </p>
            {resultado.recusadas?.length > 0 && (
              <div>
                <h3 className="label">O servidor recusou</h3>
                <ul className="space-y-1 text-sm text-bad-700">
                  {resultado.recusadas.map((x, n) => (
                    <li key={n}>
                      Linha {x.linha}: {x.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </Gaveta>
  );
}

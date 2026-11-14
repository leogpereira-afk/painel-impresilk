import {useState} from 'react';
import JanelaFormulario from './JanelaFormulario.jsx';
import {resumirProduto} from '../lib/licitacoes-servicos.mjs';

export default function ConferirRequisitosLicitacao({grupo, aoSalvar, aoFechar}) {
  const [modo, setModo] = useState('manual');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(evento) {
    evento.preventDefault();
    if (ocupado) return;
    const form = new FormData(evento.currentTarget);
    setOcupado(true);
    setErro('');
    try {
      let campos = [Object.fromEntries(form)];
      let processo = '';
      if (modo === 'arquivo') {
        const arquivo = form.get('arquivo');
        if (!arquivo?.size || arquivo.size > 128 * 1024) throw new Error('Selecione um arquivo JSON de até 128 KB.');
        let conteudo;
        try { conteudo = JSON.parse(await arquivo.text()); }
        catch { throw new Error('O arquivo precisa conter JSON válido.'); }
        campos = conteudo?.documentosEdital;
        processo = conteudo?.processoPncp ?? '';
        if (typeof processo !== 'string') throw new Error('O código do processo no arquivo é inválido.');
      }
      if (await aoSalvar(grupo.id, form.get('itemId'), campos, processo)) aoFechar();
      else setErro('O navegador não conseguiu guardar os requisitos. Tente novamente.');
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  return <JanelaFormulario titulo="Incluir requisitos do edital" ocupado={ocupado} aoFechar={aoFechar} classe="lw-dialog janela-estreita">
    <div className="lie-formato" role="group" aria-label="Como incluir requisitos">
      <button type="button" className="btn-outline" aria-pressed={modo === 'manual'} onClick={() => setModo('manual')}>Preencher requisito</button>
      <button type="button" className="btn-outline" aria-pressed={modo === 'arquivo'} onClick={() => setModo('arquivo')}>Importar JSON</button>
    </div>
    <form onSubmit={salvar} className="lie-requisito-form">
      <label>Aplicar a
        <select name="itemId" className="input">
          <option value="">Todo o processo</option>
          {grupo.itens.map(({chave, item}) => <option value={chave} key={chave}>{resumirProduto(item.produto)}</option>)}
        </select>
      </label>
      {modo === 'arquivo' ? <>
        <p>Importe a lista conferida no edital vigente.</p>
        <label>Arquivo do checklist<input className="input" name="arquivo" type="file" accept=".json,application/json" required /></label>
      </> : <>
        <label>Categoria
          <select name="categoria" className="input">
            <option value="credenciamento">Credenciamento</option>
            <option value="habilitacao">Habilitação</option>
            <option value="proposta">Proposta</option>
          </select>
        </label>
        <label>Documento ou exigência<input className="input" name="nome" required maxLength={200} /></label>
        <label>O que apresentar<textarea className="input" name="orientacao" required maxLength={800} rows={2} /></label>
        <label>Cláusula, página ou anexo<input className="input" name="referencia" required maxLength={140} /></label>
        <label>Link oficial do edital<input className="input" name="fonteUrl" type="url" required /></label>
        <label>Link do modelo, se houver<input className="input" name="modeloUrl" type="url" /></label>
      </>}
      {erro && <p className="lie-item-erro" role="alert">{erro}</p>}
      <button type="submit" className="btn-primary" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar no checklist'}</button>
    </form>
  </JanelaFormulario>;
}

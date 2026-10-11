/* QUAL GAVETA ABRE. A página guarda só o pedido ({tipo, id, canalId,
 * semana}); aqui ele vira o formulário certo, achando o registro pelo id na
 * lista que está na tela.
 *
 * REGISTRO QUE SUMIU NÃO VIRA FORMULÁRIO NOVO. Se a ação (ou a publicação)
 * foi retirada por outra pessoa entre o toque e a gaveta abrir, o id não está
 * mais na lista. Mandar `acao={undefined}` para o FormAcao abriria "Nova
 * ação" com o id velho, e salvar criaria outra. A gaveta diz que sumiu.
 */
import Gaveta from '../Gaveta.jsx';
import FormAcao from './FormAcao.jsx';
import ImportarCsv from './ImportarCsv.jsx';
import { DetalheItem, FormPublicacao, FormMetricas } from './Detalhes.jsx';
import { useMarketing } from './contexto.js';

function Sumiu({ titulo, texto, onFechar }) {
  return (
    <Gaveta
      aberta
      titulo={titulo}
      onFechar={onFechar}
      rodape={
        <button type="button" className="btn-outline" onClick={onFechar}>
          Fechar
        </button>
      }
    >
      <p className="text-sm text-slate-600">{texto}</p>
    </Gaveta>
  );
}

export default function GavetaDoMarketing({ gaveta, onFechar }) {
  const { painel } = useMarketing();
  if (!gaveta) return null;
  const { tipo, id, canalId = '', semana } = gaveta;

  if (tipo === 'acao') {
    if (!id) return <FormAcao canalId={canalId} onFechar={onFechar} />;
    const acao = painel.acoes.find((a) => a.id === id);
    if (!acao) return <Sumiu titulo="Ação" texto="Esta ação não existe mais. Ela pode ter sido retirada em outro aparelho." onFechar={onFechar} />;
    return <FormAcao acao={acao} onFechar={onFechar} />;
  }
  if (tipo === 'publicacao') {
    if (!id) return <FormPublicacao canalId={canalId} onFechar={onFechar} />;
    const publicacao = painel.publicacoes.find((p) => p.id === id);
    if (!publicacao) return <Sumiu titulo="Publicação" texto="Esta publicação não existe mais. Ela pode ter sido retirada em outro aparelho." onFechar={onFechar} />;
    return <FormPublicacao publicacao={publicacao} onFechar={onFechar} />;
  }
  if (tipo === 'item') return <DetalheItem id={id} onFechar={onFechar} />;
  if (tipo === 'metricas') return <FormMetricas canalId={canalId} semana={semana} onFechar={onFechar} />;
  if (tipo === 'csv') return <ImportarCsv canalId={canalId} onFechar={onFechar} />;
  return null;
}

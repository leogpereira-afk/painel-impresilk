import test from 'node:test';
import assert from 'node:assert/strict';
import {avisoPersistenciaPrevia} from '../src/review/aviso-persistencia.mjs';
import {idAgendamentoLicitacao} from '../supabase/functions/_shared/licitacoes-agenda.mjs';

test('aviso do calendário distingue agendamento de licitação dos registros preservados',()=>{
  const aviso=avisoPersistenciaPrevia('/calendario-empresa');
  assert.match(aviso,/Agendamentos de Licitações são descartados ao recarregar/);
  assert.match(aviso,/Demandas e Consultorias de teste permanecem/);
  assert.match(aviso,/Anexos de teste não são preservados/);
});
test('aviso corresponde ao mock: navegação preserva e nova instância de prévia descarta agendamento',async()=>{
  const primeira=await import('../src/review/licitacoes-agenda.mjs?aviso-primeira');
  const sessao={master:true},origemPesquisa={relatorioId:'pesquisa-ficticia-aviso',itemId:'item-aviso',orgao:'Órgão fictício',processo:'Teste aviso',item:'Placas',lote:'',pendente:true};
  const ficha={cadastroId:await idAgendamentoLicitacao(origemPesquisa),tipo:'licitacao',nome:'Conferência fictícia',validade:'',hora:'',status:'avaliar',acompanhamento:{prazoAcao:'2026-11-05'},origemPesquisa};
  assert.equal((await primeira.salvarLicitacaoDemo({action:'salvar',item:ficha},sessao)).status,200);
  const navegacao=await import('../src/review/licitacoes-agenda.mjs?aviso-primeira');
  assert.equal(navegacao.listarLicitacoesDemo(sessao).length,1);
  assert.equal((await navegacao.agendaLicitacoesDemo('2026-11',sessao).json()).eventos.length,1);
  const recarga=await import('../src/review/licitacoes-agenda.mjs?aviso-recarga');
  assert.equal(recarga.listarLicitacoesDemo(sessao).length,0);
  assert.match(avisoPersistenciaPrevia('/calendario-empresa'),/Licitações são descartados ao recarregar/);
});
test('avisos das demais rotas mantêm seus comportamentos anteriores',()=>{
  for(const rota of ['/consultorias','/demandas','/colaborar','/reunioes'])assert.equal(avisoPersistenciaPrevia(rota),'Reuniões, fichas e acessos de teste permanecem nesta aba ao atualizar. Anexos de teste não são preservados.');
  for(const ferramenta of ['acm','letra-caixa','impressao-3d','acrylic','mdf','metalon'])assert.equal(avisoPersistenciaPrevia('/ferramenta-ia','?ferramenta='+ferramenta),'Rascunhos de teste das ferramentas ficam neste navegador.');
  assert.equal(avisoPersistenciaPrevia('/licitacoes'),'Alterações nesta demonstração ficam apenas nesta aba e são descartadas ao recarregar.');
});

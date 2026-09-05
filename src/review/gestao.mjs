// Exemplos fictícios exclusivos da compilação local de revisão.
export const gestaoDemo = {
 ok:true,papel:'diretoria',empresaId:'demo',preferencias:{tatico:true},
 identidade:{missao:'Transformar ideias em comunicação visual que aproxima marcas e pessoas.',visao:'Ser referência em qualidade, atendimento e confiança.',visao_prazo:'2027-12-31',atualizado_em:'2026-09-01',atualizado_por:'Equipe de demonstração'},
 valores:[{id:'v1',nome:'Qualidade em cada entrega',comportamento_esperado:'Conferir acabamento, medidas e instalação antes da entrega.',ordem:0}],
 plano:{id:'p1',ano:2026,status:'ativo',tese:'Crescer com previsibilidade: entregas organizadas, clientes bem atendidos e equipe com prioridades claras.'},
 objetivos:[{id:'o1',titulo:'Melhorar a experiência do cliente',responsavel:'Ana Exemplo',situacao:'no_rumo',ordem:0},{id:'o2',titulo:'Dar mais previsibilidade às entregas',responsavel:'Bruno Exemplo',situacao:'atencao',ordem:1}],
 indicadores:[{id:'i1',objetivo_id:'o1',nome:'Satisfação do cliente',meta:95,atual:89,unidade:'%',ordem:0}],
 taticas:[{id:'t1',objetivo_id:'o1',titulo:'Padronizar o acompanhamento após a instalação',responsavel:'Ana Exemplo',prazo:'2026-09-18',status:'em_andamento',escopo:'empresa'}, {id:'t2',objetivo_id:'o2',titulo:'Revisar os pontos de espera entre produção e instalação',responsavel:'Bruno Exemplo',prazo:'2026-09-03',status:'aberta',escopo:'empresa'}, {id:'t3',objetivo_id:'o2',titulo:'Definir responsável pela conferência final',responsavel:'',prazo:'2026-09-15',status:'aberta',escopo:'empresa'}, {id:'t4',objetivo_id:'o1',titulo:'Organizar roteiro de contato com clientes',responsavel:'Ana Exemplo',prazo:'2026-09-04',status:'concluida',concluido_em:'2026-09-03T14:00:00Z',decisao_id:'d1',escopo:'empresa'}],
 equipe:[{id:'e1',nome:'Ana Exemplo',area:'Atendimento',cargo:'Coordenação'},{id:'e2',nome:'Bruno Exemplo',area:'Operações',cargo:'Coordenação'}],
 reunioes:[{id:'r1',tipo:'semanal_gestao',data:'2026-09-01',status:'rascunho',participantes:['Ana Exemplo','Bruno Exemplo'],pauta:'Prioridades da semana e acompanhamento das entregas.',registro:'Revisar os pontos de espera e padronizar o contato com clientes.'}],
 decisoes:[{id:'d1',reuniao_id:'r1',texto:'Organizar roteiro de contato com clientes',responsavel:'Ana Exemplo',prazo:'2026-09-04',status:'concluida'},{id:'d2',reuniao_id:'r1',texto:'Conferir o fluxo de aprovação',responsavel:'Bruno Exemplo',prazo:'2026-09-04',status:'concluida'},{id:'d3',reuniao_id:'r1',texto:'Definir os responsáveis por etapa',responsavel:'Bruno Exemplo',prazo:'2026-09-15',status:'aberta'}],ciclos:[]
};
export async function chamarGestaoDemo(action){
 if(action==='tudo') return structuredClone(gestaoDemo);
 if(action==='preferencia') return {ok:true};
 throw new Error('Prévia local: explore os formulários. As alterações não são gravadas.');
}
export async function chamarAssinaturasDemo(action){
 if(action==='get')return {valor:{demo:{nome:'Serviço de demonstração',oQue:'Exemplo de uma assinatura mensal',diaVencimento:10,valor:99,moeda:'BRL',ativa:true,pagos:{}}}};
 throw new Error('Prévia local: pagamentos e alterações não são gravados.');
}

// Conteúdo institucional e cálculos de apresentação. Nenhum cadastro de pessoa real.
export const STATUS = {
  planejada: 'Planejada',
  em_andamento: 'Em prática',
  bloqueada: 'Preciso de apoio',
  em_validacao: 'Aguardando validação',
  validada: 'Validada',
};
export const FASES = [
  { fase: 30, inicio: 1, fim: 30, titulo: 'Clareza e base', foco: 'Alinhar responsabilidades, conferir informações e observar causas.' },
  { fase: 60, inicio: 31, fim: 60, titulo: 'Aplicação e correção', foco: 'Aplicar os combinados e verificar o efeito das correções.' },
  { fase: 90, inicio: 61, fim: 90, titulo: 'Consistência e evolução', foco: 'Consolidar a rotina, demonstrar autonomia e pactuar o próximo passo.' },
];
const DIA = 86400000;
const fuso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

function diaCivil(valor) {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const instante = Date.parse(`${valor}T12:00:00Z`);
    if (Number.isFinite(instante) && new Date(instante).toISOString().slice(0, 10) === valor) return valor;
    return null;
  }
  const instante = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(instante.getTime())) return null;
  const partes = Object.fromEntries(fuso.formatToParts(instante).map(p => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Dias de calendário no fuso da empresa; o último dia pertence ao ciclo. */
export function ciclo90(inicio, agora = new Date()) {
  const base = { dia: 0, percentual: 0, fase: null, situacao: 'nao_iniciado', diasRestantes: 90, inicio: null, fim: null, rotuloFase: 'Início a combinar' };
  const primeiro = inicio ? diaCivil(inicio) : null;
  const hoje = diaCivil(agora);
  if (!primeiro || !hoje) return base;
  const t0 = Date.parse(`${primeiro}T12:00:00Z`);
  const decorrido = Math.floor((Date.parse(`${hoje}T12:00:00Z`) - t0) / DIA);
  const fim = new Date(t0 + 89 * DIA).toISOString().slice(0, 10);
  if (decorrido < 0) return { ...base, inicio: primeiro, fim, situacao: 'agendado', rotuloFase: 'Início agendado' };
  const dia = Math.min(90, decorrido + 1);
  const fase = dia <= 30 ? 30 : dia <= 60 ? 60 : 90;
  return { dia, percentual: Math.round(dia / 90 * 100), fase, situacao: decorrido >= 90 ? 'encerrado' : 'em_curso', diasRestantes: Math.max(0, 90 - dia), inicio: primeiro, fim, rotuloFase: FASES.find(f => f.fase === fase).titulo };
}

/** Não soma histórico nem XP enviado pelo cliente: reabrir retira o crédito. */
export function xpVirada(missoes = []) {
  const vistas = new Set();
  return missoes.reduce((total, m) => {
    if (!m || typeof m.id !== 'string' || !m.id || vistas.has(m.id)) return total;
    vistas.add(m.id);
    return total + (m.status === 'validada' ? 10 : 0);
  }, 0);
}

export function conquistasVirada(missoes = []) {
  const validadas = missoes.filter(m => m.status === 'validada');
  return [
    { id: 'primeiro_avanco', titulo: 'Primeiro avanço', descricao: 'Uma missão demonstrada e validada.', conquistada: validadas.length > 0 },
    { id: 'melhoria_aplicada', titulo: 'Melhoria aplicada', descricao: 'Uma melhoria de processo com resultado conferido.', conquistada: validadas.some(m => m.tipo === 'melhoria') },
    { id: 'conhecimento_compartilhado', titulo: 'Conhecimento compartilhado', descricao: 'Aprendizagem aplicada e ensinada com demonstração conferida.', conquistada: validadas.some(m => m.tipo === 'aprendizado' && m.conhecimentoCompartilhado === true) },
  ];
}

export const CULTURA = {
  "missao": "Transformar o visual em ambientes agradáveis com resultados.",
  "visao": "Ser excelência na entrega.",
  "valores": [
    {
      "id": 1,
      "titulo": "Somos uma empresa cristã",
      "descricao": "É de onde vem a régua. O que isso obriga a casa a fazer: não mentir para vender, não lucrar em cima do erro do outro, cuidar de quem trabalha aqui."
    },
    {
      "id": 2,
      "titulo": "A verdade acima de tudo",
      "descricao": "Principalmente a ruim. Quebrou máquina, faltou material, errou a medida, vai atrasar: fala na hora, para quem resolve. Quem avisa cedo não é punido; quem esconde, sim."
    },
    {
      "id": 3,
      "titulo": "Orgulho em servir",
      "descricao": "Atender é o trabalho, não favor. Pedido pequeno tem o mesmo dono que o grande."
    },
    {
      "id": 4,
      "titulo": "Cuidamos do que a cidade vê",
      "descricao": "O que sai daqui não fica guardado em gaveta: fica na fachada, na rua, por anos. Muda a cara de Montes Claros e leva o nosso nome junto."
    },
    {
      "id": 5,
      "titulo": "Pensamos e agimos como donos",
      "descricao": "Retalho que dá para aproveitar, luz acesa em galpão vazio, máquina rodando à toa. Dono não desperdiça nem quando ninguém está vendo."
    },
    {
      "id": 6,
      "titulo": "Total compromisso com o resultado do cliente",
      "descricao": "O resultado dele é a peça funcionando: LED aceso, porta fechando, letra firme no vento. Não é a nota emitida."
    },
    {
      "id": 7,
      "titulo": "Entregamos o combinado",
      "descricao": "Data, preço e proposta valem depois do aperto de mão. Prazo aqui não é estimativa, é dívida: só se promete a data que a linha aguenta."
    },
    {
      "id": 8,
      "titulo": "Sempre disponíveis",
      "descricao": "Dentro do expediente, ninguém fica sem resposta. Fora dele, a casa não cobra: sem treinamento à noite, sem tarefa no domingo."
    },
    {
      "id": 9,
      "titulo": "Total abertura e feedback",
      "descricao": "Dito na hora, na frente, com nome. E nos dois sentidos: o time cobra o encarregado, e a direção também ouve. A cobrança faz crescer; cobrança sim, humilhação não."
    },
    {
      "id": 10,
      "titulo": "Focados em solução",
      "descricao": "Problema apontado sem caminho é fofoca com crachá. E foco é uma coisa por vez: três frentes abertas e nenhuma terminada é o mesmo que nenhuma."
    },
    {
      "id": 11,
      "titulo": "Especialistas no que fazemos",
      "descricao": "Quem opera responde pela peça e sabe quando a máquina está saindo do ponto. A casa paga o treino, dentro do expediente. Em troca, você ensina o próximo."
    },
    {
      "id": 12,
      "titulo": "Sempre terminamos o que começamos",
      "descricao": "Serviço parado no meio ocupa espaço, prende material e some do radar. Ideia que fica no papel não vira nada. O que a casa abre, a casa fecha."
    }
  ]
};

export const MODELOS_MISSAO = [
  {
    "id": "decisao_clara",
    "titulo": "Decisão compreendida pela equipe",
    "objetivo": "Escolher uma decisão que afete a operação. Registrar resultado esperado, responsável, prazo e alçada. Confirmar com o responsável o entendimento e revisar o desfecho.",
    "criterio": "O responsável explica o combinado e o registro mostra decisão, responsável, prazo e desfecho ou próxima ação.",
    "tipo": "compromisso",
    "fase": 30,
    "perfil": "direction",
    "valores": [
      7,
      9
    ]
  },
  {
    "id": "briefing_conferido",
    "titulo": "Briefing pronto para a próxima etapa",
    "objetivo": "Selecionar um pedido real antes do design. Conferir medidas, superfície, fotos, escopo e versão. Resolver ou encaminhar lacunas com dono e prazo.",
    "criterio": "Projetos recebe informação suficiente para a etapa combinada, ou a etapa afetada permanece bloqueada com motivo claro.",
    "tipo": "melhoria",
    "fase": 30,
    "perfil": "commercial",
    "valores": [
      2,
      7
    ]
  },
  {
    "id": "pedido_material",
    "titulo": "Necessidade de material completa",
    "objetivo": "Escolher uma O.S. com necessidade de material. Conferir saldo e retalhos com o almoxarifado. Solicitar especificação, unidade, quantidade e data necessária ao compras.",
    "criterio": "Compras confirma que recebeu a necessidade completa e o PCP registra a situação do material.",
    "tipo": "compromisso",
    "fase": 30,
    "perfil": "pcp",
    "valores": [
      5,
      7
    ]
  },
  {
    "id": "aproveitamento",
    "titulo": "Retalho com destino definido",
    "objetivo": "Selecionar uma operação com corte ou uso de chapa. Conferir retalhos e validar a aplicação com a referência técnica. Registrar o plano usado, consumo e sobra útil.",
    "criterio": "O plano foi executado e o resultado foi conferido; redução de perda só é declarada quando há comparação documentada.",
    "tipo": "melhoria",
    "fase": 60,
    "perfil": "pcp",
    "valores": [
      5,
      10
    ]
  },
  {
    "id": "compra_conferida",
    "titulo": "Compra acompanhada até a disponibilidade",
    "objetivo": "Conferir especificação e aplicação com a referência técnica. Acompanhar previsão e eventuais divergências. Confirmar recebimento conferido e informar disponibilidade ao PCP.",
    "criterio": "O registro distingue comprado, recebido e disponível; dúvidas e substituições têm validação técnica.",
    "tipo": "aprendizado",
    "fase": 60,
    "perfil": "purchasing",
    "valores": [
      2,
      5
    ]
  },
  {
    "id": "capacidade_integrada",
    "titulo": "Programação compatível com a capacidade",
    "objetivo": "Selecionar um conflito real de material, pessoa ou máquina. Revisar dependências e efeito na instalação com os responsáveis. Combinar a solução e confirmar atualização na programação única.",
    "criterio": "O conflito tem decisão compatível entre áreas, responsável e registro no PCP; o efeito da ação foi conferido.",
    "tipo": "melhoria",
    "fase": 30,
    "perfil": "production_management",
    "valores": [
      7,
      10
    ]
  },
  {
    "id": "rotina_tecnica",
    "titulo": "Restrição técnica tratada antes da execução",
    "objetivo": "Selecionar uma condição de equipamento ou impressão. Definir conferência ou manutenção no escopo técnico competente. Orientar o operador e verificar aplicação e disponibilidade.",
    "criterio": "O operador demonstra o método aplicável; a restrição e seu efeito na capacidade foram informados ao PCP.",
    "tipo": "aprendizado",
    "fase": 60,
    "perfil": "technical_coordination",
    "valores": [
      5,
      11
    ]
  },
  {
    "id": "saida_conferida",
    "titulo": "Equipe sai com o conjunto conferido",
    "objetivo": "Escolher uma saída de instalação real. Conferir peça, quantidade, acabamento, proteção, ferramentas e acesso. Confirmar com a equipe o recebimento e as pendências resolvidas.",
    "criterio": "A saída tem conferente, checklist e condições de execução identificadas; item impeditivo é resolvido antes da saída.",
    "tipo": "compromisso",
    "fase": 30,
    "perfil": "installation_supervision",
    "valores": [
      4,
      7
    ]
  },
  {
    "id": "campo_acompanhado",
    "titulo": "Instalação acompanhada até o retorno",
    "objetivo": "Acompanhar uma equipe e receber relato ao fim de cada dia. Encaminhar impedimentos quando aparecem, com responsável e próxima ação. Vincular fotos e relato à O.S. e conferir a conclusão ou pendências.",
    "criterio": "O caso tem continuidade entre rua e PCP; fotos e relato explicam executado, restante e apoio, inclusive em serviço inacabado.",
    "tipo": "melhoria",
    "fase": 60,
    "perfil": "installation_supervision",
    "valores": [
      6,
      12
    ]
  },
  {
    "id": "ensino_verificado",
    "titulo": "Uma pessoa aprende e demonstra",
    "objetivo": "Escolher uma atividade de execução, acabamento ou instalação. Explicar o critério e acompanhar outra pessoa executando. Conferir a aprendizagem e combinar o próximo passo.",
    "criterio": "A pessoa orientada demonstra a atividade no escopo observado; o acompanhador registra o que ela executa com ou sem apoio.",
    "tipo": "aprendizado",
    "fase": 90,
    "perfil": "technical_mentor",
    "valores": [
      9,
      11
    ]
  }
];

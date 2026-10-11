/* A CARGA PADRÃO DO MARKETING: canais e playbook da especificação do Léo
 * (10/10/2026, seções 1 e 6). Docs: docs/marketing/a2-contrato.md.
 *
 * Isto NÃO é regra fixa: é só o ponto de partida que o botão "Carregar
 * canais e playbook padrão" grava (painel_mkt_carregar_padrao). Depois de
 * gravado, tudo se edita em Configurações, e rodar a carga de novo não
 * sobrescreve nada (cada linha entra pelo `codigo`, uma vez só).
 *
 * O repositório é PÚBLICO: aqui não entra responsável, valor em R$, telefone
 * nem link que não seja público. Dos perfis, só o endereço do site que a
 * especificação traz; o resto a casa preenche na tela.
 *
 * Como as frases da especificação viraram campos:
 *  - "Única" vira tipo `unica`; as do Pinterest (canal em implantação) são o
 *    checklist de implantação (`implantacao: true`);
 *  - "Rotina" vira `rotina` com recorrência e meta por período:
 *    "3 a 4 posts por semana" = semanal, meta 4; "stories diários" = diária;
 *    "10 pins por semana" = semanal, meta 10; "1 artigo por mês" = mensal,
 *    meta 1; "checking quinzenal" = a cada 15 dias; "plotagem trimestral" =
 *    a cada 90 dias. Sem frequência escrita (equipe compartilha, espelhar o
 *    Instagram, conferir semanal), vale a semana, meta 1;
 *  - "responder avaliações em 24h" do Google é o gatilho "avaliação nova" da
 *    seção 5 da especificação (prazo de 1 dia), não uma rotina.
 */

// Ordem de 10 em 10: dá para encaixar um canal novo entre dois sem renumerar.
export const CANAIS_PADRAO = [
  { codigo: 'site', nome: 'Site', grupo: 'digital', icone: 'globe', cor: '#0f766e', ordem: 10, urlPerfil: 'https://impresilk.com.br' },
  { codigo: 'instagram', nome: 'Instagram', grupo: 'digital', icone: 'instagram', cor: '#c13584', ordem: 20 },
  { codigo: 'linkedin', nome: 'LinkedIn', grupo: 'digital', icone: 'linkedin', cor: '#0a66c2', ordem: 30 },
  { codigo: 'facebook', nome: 'Facebook', grupo: 'digital', icone: 'facebook', cor: '#1877f2', ordem: 40 },
  { codigo: 'pinterest', nome: 'Pinterest', grupo: 'digital', icone: 'pin', cor: '#e60023', ordem: 50, emImplantacao: true },
  { codigo: 'google', nome: 'Google Meu Negócio', grupo: 'digital', icone: 'map-pin', cor: '#34a853', ordem: 60 },
  { codigo: 'whatsapp', nome: 'WhatsApp', grupo: 'contato', icone: 'message-circle', cor: '#25d366', ordem: 70, comercialCanal: 'whatsapp' },
  { codigo: 'ligacao', nome: 'Ligação', grupo: 'contato', icone: 'phone', cor: '#6366f1', ordem: 80, comercialCanal: 'ligacao' },
  { codigo: 'email', nome: 'E-mail', grupo: 'contato', icone: 'mail', cor: '#64748b', ordem: 90 },
  { codigo: 'visita', nome: 'Visita', grupo: 'contato', icone: 'handshake', cor: '#b45309', ordem: 100, comercialCanal: 'visita' },
  { codigo: 'offline', nome: 'Offline', grupo: 'offline', icone: 'megaphone', cor: '#7c3aed', ordem: 110 },
];

const unica = (titulo, extra = {}) => ({ tipo: 'unica', titulo, ...extra });
const rotina = (titulo, recorrencia, metaQuantidade = 1, extra = {}) => ({ tipo: 'rotina', titulo, recorrencia, metaQuantidade, ...extra });

// Itens por canal, na ordem da especificação. O código vira `<canal>-<n>`.
const POR_CANAL = {
  site: [
    unica('Redirecionamento 301 dos endereços antigos ?page_id='),
    unica('Facebook e Pinterest no rodapé do site'),
    unica('Horário de atendimento no site'),
    unica('WhatsApp do site medido no GA4'),
    unica('GA4 e Search Console configurados'),
    unica('Dados estruturados no site'),
    rotina('1 página de obra por semana', 'semanal', 1),
    rotina('Ajuste mensal de títulos', 'mensal', 1),
  ],
  instagram: [
    unica('Bio com link com UTM e WhatsApp'),
    unica('Destaques por solução'),
    rotina('3 a 4 posts por semana, com pelo menos 2 reels', 'semanal', 4),
    rotina('Stories diários', 'diaria', 1),
    rotina('Responder mensagens e comentários todo dia', 'diaria', 1),
    rotina('Análise mensal do Instagram', 'mensal', 1),
  ],
  linkedin: [
    unica('Completar a página da empresa'),
    rotina('2 posts B2B por semana', 'semanal', 2),
    rotina('1 artigo por mês', 'mensal', 1),
    rotina('Equipe compartilha os posts da semana', 'semanal', 1),
  ],
  facebook: [
    unica('Revisar a página'),
    rotina('Espelhar os posts do Instagram', 'semanal', 1),
    rotina('Responder mensagens e comentários em até 24h', 'diaria', 1),
  ],
  pinterest: [
    unica('Criar a conta comercial', { implantacao: true }),
    unica('Criar as pastas', { implantacao: true }),
    unica('Subir o acervo de fotos', { implantacao: true }),
    rotina('10 pins por semana', 'semanal', 10),
  ],
  google: [
    unica('Revisar o perfil'),
    rotina('1 post e fotos novas por semana', 'semanal', 1),
    { tipo: 'gatilho', titulo: 'Responder avaliação em até 24h', gatilho: 'avaliacao_nova', prazoDias: 1 },
  ],
  whatsapp: [
    unica('Tabela de mensagens prontas'),
    unica('Etiquetas de origem nas conversas'),
    rotina('Registrar a origem das conversas do dia', 'diaria', 1),
    rotina('Conferir as etiquetas de origem da semana', 'semanal', 1),
  ],
  offline: [
    rotina('Checking fotográfico quinzenal de outdoor e frota', 'cada_n_dias', 1, { aCadaDias: 15, evidencia: 'foto' }),
    rotina('Plotagem trimestral', 'cada_n_dias', 1, { aCadaDias: 90 }),
    rotina('Comparação mensal dos resultados offline', 'mensal', 1),
  ],
};

export const PLAYBOOK_PADRAO = Object.entries(POR_CANAL).flatMap(([canal, itens]) =>
  itens.map((item, i) => ({ codigo: `${canal}-${i + 1}`, canal, ordem: (i + 1) * 10, ...item })));

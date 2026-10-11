# Marketing a2: contrato entre banco, servidor e tela

Etapa a2 do Centro de Comando do Marketing (plano em `docs/marketing/plano-centro-de-comando.md`).
Base: a1 no ar (commit 355ace4): tabelas `painel_mkt_acoes`, `painel_mkt_orcamento_vinculo`, `painel_mkt_log`,
Edge Function `painel-marketing`, `_shared/marketing.mjs`, tela `src/components/PlanejamentoMarketing.jsx`.
Leia o código da a1 antes: este contrato estende aquele padrão, não cria outro.

Regras da casa que valem para tudo: PT-BR, sem travessão (os traços longos) em texto de tela, comentário ou
mensagem; tudo por id (UUID), nunca por nome; nada de regra fixa que devia ser editável (os canais, o
playbook e os papéis são editáveis); celular primeiro; tema claro e escuro (classes com par em `index.css`);
alvo de toque de 44px; Mubi só leitura; nenhum dado pessoal ou financeiro na URL.

## 1. O que a a2 entrega

1. Canais configuráveis (chips), com carga inicial por botão.
2. Playbook por canal (ação única, rotina, gatilho), editável, com carga inicial do item 6.3 da especificação.
3. Papéis internos do Marketing: `gestao`, `marketing`, `visualizacao`.
4. A aba Marketing nova: fileira de chips fixa no topo (Visão geral + um chip por canal ativo ou em
   implantação), Materiais e Drive como botão fixo no topo, canal aberto com Fazer, Resultados, Calendário e
   Histórico.
5. Lançamento manual de números: semanal por canal, por publicação colando o link, e importação de CSV.
6. A ação ganha canal (chip) e responsável (pessoa pelo id_pessoa); o texto antigo continua guardado.
7. Componentes novos em `src/components/`: `ChipCanal.jsx`, `LinhaTarefa.jsx`, `CardCompacto.jsx`,
   `Gaveta.jsx` (gaveta lateral no computador, folha que sobe no celular).

Fora da a2 (não fazer): motor de tarefas e Compromissos (a3), card na Home (a4), campanhas (b), APIs (i).
As rotinas do playbook aparecem listadas no canal, com o aviso "entram na agenda na próxima etapa".

## 2. Banco (migração `supabase/migrations/20261011a_marketing_canais.sql`)

Mesmo padrão da a1: prefixo `painel_mkt_`, `uuid default gen_random_uuid()`, RLS ligado sem policy, revoke de
anon/authenticated, toda escrita por função `security definer` com `set search_path = public, pg_temp`,
grant só para `service_role`, gatilho `painel_mkt_registrar` (já existe) em toda tabela nova, `set_config('painel.quem', p_quem, true)`
em toda função que grava, versão otimista (`versao` + erro `40001`), `P0002` para "não encontrado".

### painel_mkt_canais
| coluna | tipo | regra |
|---|---|---|
| id | uuid pk | |
| codigo | text unique not null | `^[a-z0-9_-]{2,30}$`; estável (seed e ligação com o Comercial) |
| nome | text not null | 1 a 60 |
| grupo | text not null | `digital`, `contato`, `offline` |
| icone | text not null | um de: `globe`, `instagram`, `linkedin`, `facebook`, `pin`, `map-pin`, `message-circle`, `phone`, `mail`, `handshake`, `megaphone`, `youtube`, `store` |
| cor | text not null | `^#[0-9a-fA-F]{6}$` |
| ordem | integer not null default 0 | |
| ativo | boolean not null default true | desativar em vez de apagar |
| em_implantacao | boolean not null default false | |
| url_perfil, url_gerenciador | text | http(s) |
| mensagem_whatsapp | text | até 300 |
| dias_parado | integer not null default 7 | 1 a 90; canal sem publicação há mais que isso fica vermelho |
| comercial_canal | text | código do canal do Comercial (`ligacao`, `whatsapp`, `visita`, `email`) quando houver; ver `CANAIS` em `_shared/relacionamento-comercial.mjs` |
| versao, criado_em, criado_por, atualizado_em, atualizado_por | | como na a1 |

`painel_mkt_acoes.canal_id` ganha FK para `painel_mkt_canais(id) on delete set null` (a coluna já existe).

### painel_mkt_playbook
| coluna | tipo | regra |
|---|---|---|
| id | uuid pk | |
| canal_id | uuid not null fk canais | |
| codigo | text unique | só nos itens da carga padrão (idempotência) |
| tipo | text not null | `unica`, `rotina`, `gatilho` |
| titulo | text not null | 1 a 160 |
| instrucao | text | até 2000 |
| responsavel_id | text | id_pessoa `^[0-9]{6,11}$` |
| recorrencia | text | só rotina: `diaria`, `semanal`, `mensal`, `cada_n_dias` |
| a_cada_dias | integer | só `cada_n_dias`: 1 a 365 |
| meta_quantidade | integer | rotina: quantas por período (ex.: 4 posts por semana); 1 a 999 |
| prazo_dias | integer | prazo relativo em dias (0 a 365) |
| prioridade | text not null default 'media' | `alta`, `media`, `baixa` |
| checklist | jsonb not null default '[]' | array de strings, até 30 itens de até 200 |
| evidencia | text not null default 'nenhuma' | `nenhuma`, `link`, `foto`, `texto` |
| gatilho | text | só gatilho: código do evento (texto livre de até 60 por enquanto) |
| implantacao | boolean not null default false | item do checklist de implantação do canal |
| concluido_em, concluido_por | | só `unica`/implantação |
| evidencia_valor | text | o que foi informado ao concluir (link ou texto), até 1000 |
| ativo | boolean not null default true | |
| ordem | integer not null default 0 | |
| versao + carimbos | | |

### painel_mkt_publicacoes
| coluna | tipo | regra |
|---|---|---|
| id | uuid pk | |
| canal_id | uuid not null fk canais | |
| data | date not null | |
| titulo | text | até 200 |
| url | text | http(s), até 500; único por canal quando não nulo (`unique (canal_id, url)`) para o CSV não duplicar |
| acao_id | uuid fk painel_mkt_acoes on delete set null | opcional |
| alcance, impressoes, engajamento, cliques, leads | integer | 0 a 1e9, nulo = não informado (nunca virar zero) |
| fonte | text not null | `manual`, `csv`, `api` |
| coletado_em | timestamptz not null default now() | "fonte e data" de todo número |
| retirada_em, retirada_por | | retirar não apaga |
| versao + carimbos | | |

### painel_mkt_metricas_canal (lançamento semanal)
| coluna | tipo | regra |
|---|---|---|
| id | uuid pk | |
| canal_id | uuid not null fk canais | |
| semana | date not null | segunda-feira da semana; `unique (canal_id, semana)` |
| seguidores, alcance, impressoes, engajamento, cliques, conversas, leads | integer | 0 a 1e9, nulo = não informado |
| fonte | text not null | `manual`, `csv`, `api` |
| coletado_em | timestamptz not null default now() | |
| versao + carimbos | | |

### painel_mkt_papeis
| coluna | tipo | regra |
|---|---|---|
| id_pessoa | text pk | `^[0-9]{6,11}$` |
| papel | text not null | `gestao`, `marketing`, `visualizacao` |
| definido_por, definido_em | | |

### Funções (todas `security definer`, só `service_role`)
- `painel_mkt_salvar_canal(p_id uuid, p_dados jsonb, p_versao int, p_quem text)` cria (p_id nulo) ou edita.
- `painel_mkt_salvar_playbook(p_id uuid, p_dados jsonb, p_versao int, p_quem text)`; `painel_mkt_retirar_playbook(p_id, p_versao, p_quem)` faz `ativo=false`.
- `painel_mkt_concluir_playbook(p_id uuid, p_versao int, p_feito boolean, p_evidencia text, p_quem text)` marca ou desmarca item único/implantação.
- `painel_mkt_salvar_publicacao(p_id uuid, p_dados jsonb, p_versao int, p_quem text)`; `painel_mkt_retirar_publicacao(p_id, p_versao, p_quem)`.
- `painel_mkt_importar_publicacoes(p_linhas jsonb, p_quem text)` recebe array já validado; upsert por `(canal_id, url)`; linha sem url sempre insere; devolve `{inseridas, atualizadas}`. Tudo numa transação.
- `painel_mkt_salvar_metricas(p_canal uuid, p_semana date, p_dados jsonb, p_quem text)` upsert por (canal, semana), sobe a versão.
- `painel_mkt_definir_papel(p_id_pessoa text, p_papel text, p_quem text)`; papel nulo apaga a linha.
- `painel_mkt_carregar_padrao(p_padrao jsonb, p_quem text)` insere canais e playbook pelo `codigo` com `on conflict (codigo) do nothing` (nunca sobrescreve o que a casa editou); devolve `{canais, itens}` inseridos.
- `painel_mkt_salvar_acao` (a1) passa a aceitar `canal_id` e `responsavel_id` em `p_dados` (canal tem de existir; senão `P0002`).
- `painel_mkt_exportar` e `painel_mkt_restaurar` passam a cobrir as 5 tabelas novas. Na volta, ordem: canais, playbook, ações, vínculos, publicações, métricas, papéis, log. Upsert por chave primária; quando a chave única (codigo, canal+url, canal+semana) colidir com outra linha de id diferente, a linha do arquivo vence (apagar a outra antes). A versão nunca repete (`greatest(atual, arquivo) + 1`), como na a1.
- `src/../painel-backup`: acrescentar as tabelas novas em `TABELAS_MARKETING` (a cópia vem da `painel_mkt_exportar`).

## 3. Servidor (`supabase/functions/painel-marketing/index.ts`, `_shared/marketing.mjs`)

Mesmo topo da a1 (crachá, módulo `marketing`). Papel efetivo:
- direção (`master` ou `*`) é sempre `gestao`;
- senão, o id_pessoa do login (ver abaixo) procurado em `painel_mkt_papeis`; sem linha, `marketing`.
- id_pessoa do login: `acesso_conta.id_pessoa` da conta cujo `usuario = s.sub` (ou via `acesso_papel` com `sistema='painel'` e `login = s.sub`, como `identidadeRH` em `painel-processos`); ambíguo ou ausente dá `null`.

| ação | papel | corpo | resposta |
|---|---|---|---|
| `painel` | qualquer | `{}` | `{ok, papel, idPessoa, canais, playbook, acoes, publicacoes, metricas, legado:{pendentes}, podeMigrar}` (publicações dos últimos 400 dias, métricas das últimas 26 semanas; tudo paginado) |
| `pessoas` | qualquer | `{}` | `{ok, pessoas:[{idPessoa, nome, area}]}` do RH (`registros`, colecao colaboradores), ativos como em `pessoasParaReunioes`; `idPessoa` = 6 primeiros dígitos do CPF calculados NO SERVIDOR (o CPF nunca sai); pessoa com idPessoa repetido ou sem CPF fica fora, e `semId` conta quantas |
| `acoes` | qualquer | (a1, continua) | |
| `salvarAcao` | marketing ou gestao | a1 + `acao.canalId`, `acao.responsavelId` | a1 |
| `retirarAcao`, `migrarLegado` | a1 | | |
| `salvarCanal` | gestao | `{canal, versao?}` | `{ok, canal}` |
| `salvarPlaybook` | gestao | `{item, versao?}` | `{ok, item}` |
| `retirarPlaybook` | gestao | `{id, versao}` | `{ok}` |
| `concluirPlaybook` | marketing ou gestao | `{id, versao, feito, evidencia?}` | `{ok, item}`; exige `evidencia` quando o item pede `link` ou `texto` |
| `salvarPublicacao` | marketing ou gestao | `{publicacao, versao?}` | `{ok, publicacao}` |
| `retirarPublicacao` | marketing ou gestao | `{id, versao}` | `{ok}` |
| `importarPublicacoes` | marketing ou gestao | `{linhas:[...]}` até 2000 | `{ok, inseridas, atualizadas, recusadas:[{linha, motivo}]}`; linha inválida é recusada com motivo, as boas entram |
| `salvarMetricas` | marketing ou gestao | `{canalId, semana, numeros}` | `{ok, metricas}` |
| `definirPapel` | gestao | `{idPessoa, papel|null}` | `{ok}` |
| `carregarPadrao` | gestao | `{}` | `{ok, canais, itens}`; o conteúdo vem de `_shared/marketing-padrao.mjs` |

Validadores em `_shared/marketing.mjs` (`prepararCanal`, `prepararItemPlaybook`, `prepararPublicacao`,
`prepararMetricas`, `prepararLinhaCsv`), mesmo estilo de `prepararAcao` (ErroMarketing 422 com mensagem para gente).
`acaoParaTela` passa a devolver `canalId` e `responsavelId`. Formato de tela (camelCase) para cada tabela:
`canalParaTela`, `itemParaTela`, `publicacaoParaTela`, `metricasParaTela`.

Erros: `erroDoBanco` já mapeia 40001/P0002/23505; acrescentar a mensagem de `unique (canal_id, url)`
("Esta publicação já foi lançada neste canal").

### Carga padrão (`_shared/marketing-padrao.mjs`)
Canais (codigo, nome, grupo, ícone, cor, ordem, em_implantacao, comercial_canal):
site Site digital globe #0f766e; instagram Instagram digital instagram #c13584; linkedin LinkedIn digital linkedin #0a66c2;
facebook Facebook digital facebook #1877f2; pinterest Pinterest digital pin #e60023 (em implantação);
google Google Meu Negócio digital map-pin #34a853; whatsapp WhatsApp contato message-circle #25d366 (comercial whatsapp);
ligacao Ligação contato phone #6366f1 (comercial ligacao); email E-mail contato mail #64748b; visita Visita contato handshake #b45309 (comercial visita);
offline Offline offline megaphone #7c3aed. URLs de perfil: só as públicas conhecidas da especificação (impresilk.com.br; o resto em branco).
Playbook: exatamente o item 6.3 da especificação (SITE, INSTAGRAM, LINKEDIN, FACEBOOK, PINTEREST, GOOGLE MEU NEGÓCIO,
WHATSAPP, OFFLINE), cada "Única" vira tipo `unica` (as do Pinterest com `implantacao: true`), cada "Rotina" vira `rotina`
com recorrência e meta (ex.: "3 a 4 posts por semana com pelo menos 2 reels" = semanal, meta 4; "stories diários" = diaria;
"10 pins por semana" = semanal, meta 10; "1 artigo por mês" = mensal, meta 1; "checking fotográfico quinzenal" = cada_n_dias 15;
"a cada trimestre" = cada_n_dias 90). Sem responsável e sem valores em R$ (o repositório é público). `codigo` = `<canal>-<n>`.

## 4. Tela

### Componentes (`src/components/`)
- `ChipCanal.jsx`: `({canal, indicador, pendentes, semaforo, ativo, onClick, compacto})`. Pílula de 44px de altura:
  ícone (lucide pelo nome do canal), nome, indicador `{valor, variacao}` com seta, ponto do semáforo
  (`ok|warn|bad`) SEMPRE com texto ou número junto (nunca só cor), badge de pendentes. A cor do canal entra como
  detalhe (borda esquerda ou ponto) por `style` inline, nunca como fundo. `compacto` (celular): só ícone, nome e ponto.
  Ativo usa o padrão `chip-sel`.
- `LinhaTarefa.jsx`: `({titulo, canal, prazo, responsavel, tom, feito, onConcluir, onAbrir, desabilitado})`. Uma linha de ~44px:
  checkbox, título (1 linha, reticências), ponto da cor do canal, prazo curto ("hoje", "amanhã", "3 dias atrasada", "12/11"),
  iniciais do responsável (`Avatar` de `lista.jsx`). Concluir na linha com desfazer (o componente mostra "Concluída · Desfazer"
  por 6 s); tocar no título chama `onAbrir`.
- `CardCompacto.jsx`: `({titulo, sub, acoes, menu, children})`: padding `p-3`, título de 1 linha, no máximo 2 ações visíveis
  e o resto num menu "...". Nunca card dentro de card.
- `Gaveta.jsx`: `({aberta, titulo, onFechar, children, rodape})`: `<dialog>` nativo; no computador abre na lateral direita
  (largura 420px), no celular sobe de baixo (altura máxima 90vh); Esc fecha; foco no primeiro campo; tema escuro.

### Cálculos puros (`src/lib/calc/marketing-canais.js` + `marketing-canais.test.mjs`, rodam no `npm test`, TZ=UTC)
- `gruposFazer(itens, hoje)` → `{atrasadas, hoje, semana, proximas, semData}`; item tem `prazo` (YYYY-MM-DD ou nulo).
- `semaforoCanal({itensPendentes, ultimaPublicacao, diasParado, emImplantacao, contaParado}, hoje)` →
  `{tom:'ok'|'warn'|'bad', texto}`: vermelho se houver atrasada ("2 atrasadas") ou, quando `contaParado`, sem publicação há
  mais de `diasParado` dias ("parado há 12 dias"); âmbar se vence em até 48h ("vence em 2 dias"); senão verde ("em dia").
  Canal em implantação: `{tom:'warn', texto:'em implantação'}`.
- `indicadorCanal(publicacoes, hoje)` → `{valor, anterior, variacao}`: publicações dos últimos 7 dias contra os 7 anteriores.
- `topPublicacoes(publicacoes, campo, n=5)` ordena por `engajamento` ou `leads`, ignorando nulos.
- `semanaDe(data)` → segunda-feira (YYYY-MM-DD).
- `compararSemanas(metricas, semana)` → números da semana e da anterior com variação.
- CSV: `src/lib/calc/marketing-csv.js` + teste: `lerCsvPublicacoes(texto, canais)` aceita `;` ou `,`, cabeçalho em
  PT-BR (`canal`, `data` em dd/mm/aaaa ou aaaa-mm-dd, `titulo`, `link`, `alcance`, `impressoes`, `engajamento`, `cliques`, `leads`),
  canal pelo código ou pelo nome do canal (sem acento, sem caixa), números brasileiros (1.234); devolve `{linhas, erros:[{linha, motivo}]}`.
- `src/lib/format.js`: `numeroCompacto(n)` ("1,2 mil", "3,4 mi") e `moedaCompacta(n)` ("R$ 12,4 mil"); o valor exato vai no `title`.

### Hook
`src/hooks/useParamNavegavel.js`: `useParamNavegavel(chave, padrao, permitidas)` igual ao `useAbaNavegavel`, com a chave
escolhida; o `useAbaNavegavel` continua existindo e passa a usar o novo por baixo.

### Página (`src/pages/Marketing.jsx` e `src/components/marketing/*`)
- Topo: título "Marketing", botão fixo "Materiais e Drive" (abre `?v=materiais`, o conteúdo de hoje sem mudança).
- Fileira de chips fixa ao rolar (`sticky`), rolagem lateral com encaixe: "Visão geral" e um `ChipCanal` por canal ativo
  ou em implantação, na ordem. URL: `?v=geral` (padrão) ou `?v=<codigo do canal>`; dentro do canal `?sub=fazer|resultados|calendario|historico`.
- Visão geral: central Fazer (todas as ações abertas e itens únicos pendentes, agrupados por `gruposFazer`, com `LinhaTarefa`),
  KPIs (ações abertas, atrasadas, publicações em 7 dias, investimento do mês; 2 colunas no celular, 4 no computador) e,
  embaixo, a lista "Ações e resultados" de hoje (`PlanejamentoMarketing`), que ganha os campos Canal (select dos canais) e
  Responsável (select das pessoas da ação `pessoas`; o texto antigo aparece como "Responsável anterior: X" até ser trocado).
- Canal aberto:
  - Atalhos: abrir perfil, abrir gerenciador, nova publicação (abre a gaveta), copiar WhatsApp com a mensagem do canal (`wa.me/?text=`).
  - Implantação: se `em_implantacao`, o checklist dos itens `implantacao` aparece primeiro, com concluir na linha.
  - Fazer: ações do canal + itens únicos pendentes do canal; embaixo, "Rotinas do canal" (lista simples, com o aviso
    "Entram na agenda de cada pessoa na próxima etapa").
  - Resultados: números da semana contra a anterior (métricas lançadas), top 5 publicações por engajamento e por leads,
    botões "Lançar números da semana", "Lançar publicação" e "Importar CSV" (prévia antes de gravar, com as linhas recusadas e o motivo).
    Todo número mostra a fonte e a data ("Lançado à mão em 12/10").
  - Calendário: mês (`?mes=AAAA-MM`) com as ações e as publicações do canal, dia a dia, em lista compacta.
  - Histórico: ações concluídas e publicações, mais recentes primeiro, 50 por vez ("Mostrar mais").
- Detalhe de ação, publicação ou item: abre na `Gaveta`.
- Quem é `visualizacao` não vê botões de gravar; quem não é `gestao` não vê edição de canal, playbook nem papéis.
- Estados de carregamento (Skeleton), vazio (uma frase e um botão) e erro (mensagem e "Tentar de novo") em todas as vistas.

### Configurações (`src/components/ConfiguracoesModulos.jsx`, bloco Marketing)
Para `gestao`: lista de canais (editar na Gaveta: nome, grupo, ícone, cor, links, mensagem do WhatsApp, dias para parado,
ordem com subir/descer, ativo, em implantação), playbook por canal (adicionar, editar, retirar), papéis (pessoa + papel) e
o botão "Carregar canais e playbook padrão" (idempotente; mostra quantos entraram). Os atalhos do Drive continuam como estão.

### Serviço (`src/services/marketing.js`)
Uma função por ação do servidor (`lerPainelMarketing`, `listarPessoasMarketing`, `salvarCanal`, ...), no molde de `chamarMarketing`.

### Revisão (`src/review/marketing.mjs`)
O falso servidor da compilação review responde a todas as ações novas com dados de exemplo (3 ou 4 canais, alguns itens,
publicações e métricas), usando os mesmos validadores de `_shared/marketing.mjs`.

## 5. Testes obrigatórios
- `tests/marketing.test.mjs`: validadores novos (o caso ruim primeiro).
- `tests/marketing-edge.test.mjs`: papel efetivo (direção, papel da tabela, padrão marketing, visualização sem gravar),
  cada ação nova, `pessoas` sem CPF na resposta.
- `tests/marketing-banco.test.mjs` (PGlite): funções novas, unicidades, carga padrão idempotente, volta do backup com as tabelas
  novas, grants.
- `src/lib/calc/marketing-canais.test.mjs` e `marketing-csv.test.mjs`.

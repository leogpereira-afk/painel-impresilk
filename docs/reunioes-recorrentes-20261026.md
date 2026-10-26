# Reuniões recorrentes — publicação conferida

Base: `7c67842372153f560c1da3b62fefa4722e204982`. Ramo: `codex/reunioes-recorrentes-20261026`.

## Resultado
- Encontros únicos ou séries diárias, semanais, quinzenais e mensais; chips de dias, término explícito e prévia das datas.
- Até 104 ocorrências e horizonte de três anos; mês sem o dia escolhido é pulado e explicado na tela.
- Cada ocorrência mantém ID, ata, presença, anexos, decisões e histórico próprios. Calendário projeta os mesmos registros e abre a ficha; canceladas deixam a agenda.
- Participantes e responsáveis vinculados à ficha RH, com busca pelo ID oficial quando disponível. Nenhum CPF, salário ou contato pessoal adicional é consultado.
- Alterar uma, esta e próximas ou série: confirmação mostra alcance; alteração coletiva preserva ocorrências com atividade e exceções individuais não modificadas.
- Ata opcional, rascunho/finalizada, com versões e autoria. Decisão pode gerar demanda explicitamente, com permissão de Demandas, responsável RH e criação atômica/idempotente.

## Verificação em 26/10/2026
- 162 testes de reuniões, recorrência, UI, prévia, processos e acesso: aprovados, nenhum ignorado.
- PostgreSQL em memória (PGlite): rollback de lote, CAS, lixeira, repetição, validação e permissão da RPC.
- Build de produção aprovado; lint sem erros, com aviso preexistente em `Agenda.jsx:168`.
- Revisão independente de domínio, API/SQL e UI. Encontrou conteúdo de anexo expirado após reload da prévia: passou a aparecer explicitamente sem botão de download ativo.
- Navegador: criou série de três encontros com pessoa por ID, salvou ata e decisão só no primeiro, converteu em demanda e confirmou após reload. Calendário mostrou as datas e o prazo da demanda. Alteração coletiva mudou apenas duas ocorrências sem atividade, preservando a primeira.
- Celular em 390 × 844: chips e formulário sem rolagem horizontal; reunião única salva e recuperada após reload.
- Corrigida regressão detectada no navegador: restaurados handlers `onInput` em datas/horários, prazo e término, com teste que falhou antes e passou após o ajuste.

## Limites da verificação
Prévia usa dados fictícios e `sessionStorage`, isolados por aba. Anexos não mantêm os bytes após reload e ficam marcados como expirados. Limite existente de 250 KB por reunião inclui versões da ata; histórico nunca é truncado para caber.

Na etapa de prévia não houve commit, push, deploy, aplicação de migração nem criação de reunião/convite em produção. A publicação posterior está registrada abaixo. Concorrência foi verificada em PGlite; deadlock entre conexões PostgreSQL reais não foi exercitado.

Publicação autorizada pelo dono em 26/10/2026 ("subir"), após aprovação da prévia. AGENTS.md e VEZ.md remotos relidos; main permanece em 7c67842. Ordem de liberação: `supabase/migrations/20261026165648_reunioes_lote_atomico.sql`, `painel-processos` (preservação da origem de demandas), `painel-reunioes`, verificação do servidor e interface. Não criar dados reais para teste nem alterar permissões ou enviar convites.

Prévia: `http://127.0.0.1:5588/revisao-local.html#/reunioes`.

## Liberação do servidor
Commit `c99fd18`, autorizado pelo dono. RPC aditiva aplicada, SECURITY INVOKER e execução restrita ao service_role conferidos; lote vazio recusado com 22023 sem gravação. `painel-processos` v93 e `painel-reunioes` v93 ACTIVE, onze arquivos relidos iguais ao código local. Consultas sem sessão retornam 401. Nenhum registro real criado ou alterado.

Em caso de reversão após uso real, retornar somente a tela: manter o servidor que preserva os metadados de série, versões de ata e origem das demandas. A RPC aditiva pode permanecer. Não retornar preparadores antigos que descartem os novos campos.

## Publicado e conferido em 26/10/2026
- Migração `reunioes_lote_atomico` registrada no servidor como `20261026172321`, equivalente ao arquivo local `20261026165648_reunioes_lote_atomico.sql`.
- Interface `8d3bdc2`; GitHub Pages [40368627058](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/40368627058) concluído com sucesso.
- Suíte raiz 1.804/1.804, cálculos 1.458/1.458, acessos 7/7, 15 verificadores e build oficial aprovados. Lint sem erros; aviso anterior em Agenda. Referência de equipe-auth consultada na main oficial para conferir 11 sistemas e 23 módulos.
- `index.html`, `404.html` e sete assets relevantes servidos integralmente iguais ao build aprovado.
- Site oficial autenticado recarregado: listagem, novo encontro, recorrência semanal, chips, lista de datas e filtro pelo ID RH conferidos, sem erro de console. Nenhum cadastro foi salvo na produção para teste; gravação/recarga, ata/demanda e alteração coletiva foram exercitados apenas na prévia fictícia.
- Fonte: [Reuniões no Painel](https://leogpereira-afk.github.io/painel-impresilk/reunioes). Evidências e logs privados fora do Git. Nenhum convite, permissão ou registro real alterado.

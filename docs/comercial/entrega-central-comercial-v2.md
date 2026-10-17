# Central Comercial V2 — entrega e publicação

Revisão de 17/10/2026 no ramo `codex/central-comercial`, continuando a V1 local `6aa7a27`. Implementação e prévia com dados fictícios; publicada em 17/10/2026 após autorização do dono. Nenhum registro real foi alterado manualmente.

## Navegação e funcionalidades

| Pedido | Implementação conferida |
| --- | --- |
| Central com sete entradas | Visão geral, Compromissos, Bancos e Pix, Glossário, Contas atrasadas, Brief e Dashboard. Os módulos mantêm suas permissões. |
| Compromissos em dois acessos | Lateral e Central usam a mesma rota e o mesmo componente, sem cadastro adicional. Busca e formulário preservados. |
| Operação e resultados separados | Visão geral mantém Meu dia, Negociações, Clientes e Pós-venda. Vendas e metas ficam no Dashboard. Endereços antigos redirecionam e conservam período, vendedor e equipe. |
| Glossário e Soluções | Áreas Termos e conceitos e Soluções comerciais, busca compartilhada, categorias, conteúdo recolhível, catálogo, materiais, fichas e edição autorizada. |
| Gráficos | Evolução por dia/mês/ano, comparação equivalente, ranking de produtos por valor ou unidade, vendedores, clientes, metas acumuladas, Pareto, faixas de atraso, mapa de calor e descontos. |
| Interação | Gráfico/tabela, top 5/10/todos, ampliação, inspeção por mouse/toque/teclado, seleção em chips e abertura dos registros com o recorte correspondente. |
| Vendas e financeiro | Linhas compactas e expansíveis. Identificação, cliente, vendedor e líquido visíveis; sinal, recebido, saldo conciliado e ações carregados ao expandir. |
| Aparência | Cores estáveis por série, estados com texto, foco visível, densidade compacta/confortável, modo escuro e adaptação a celular. |
| Fluidez | Páginas e detalhes carregados sob demanda, listas paginadas, consultas canceláveis, cache efêmero isolado por sessão/permissões/filtro. Nenhuma dependência adicionada. |

## Integridade

Venda segue a data comercial da O.S. Faturamento, recebimento, sinal, saldo e atraso não são substitutos. Produto filtrado muda o valor de venda do recorte, enquanto o financeiro expandido identifica explicitamente a O.S. completa.

Pedidos sem empresa comprovada, títulos ambíguos e valores ausentes não entram como confirmação nos indicadores. IDs financeiros duplicados agora excluem todas as ocorrências ambíguas, independentemente da ordem, mantendo o total do gráfico igual ao detalhe. Comparações exigem cobertura equivalente; um mês isolado não é descrito como sazonalidade.

Os caminhos antigos de Resultados e Soluções preservam filtros. A revisão independente encontrou e corrigiu a perda de equipe no redirecionamento e o envio indevido do identificador de série como vendedor no clique de gráficos de vendas/descontos. Os testes de navegador reproduziram ambos os casos na versão corrigida.

## Evidências de verificação

- 1.567 testes gerais aprovados, sem falhas, cancelamentos ou ignorados.
- 676 testes de cálculo e estado de acessos aprovados, sem falhas.
- Navegador isolado, rede externa bloqueada e dados fictícios: 35 cenários aprovados — 11 do Dashboard, nove dos gráficos, dez da navegação e cinco da migração de vendas/metas. Sem erros JavaScript; teclado, celular de 390 px, modo escuro e registros dos gráficos conferidos.
- Build de produção com `BASE_PATH=/painel-impresilk/` aprovado. Dashboard permanece em um módulo separado, com aproximadamente 21 kB comprimidos; seus componentes compartilhados possuem módulos próprios.
- Os 15 verificadores previstos no Pages foram executados. O de sistemas usou a fonte pública atual de `vida-leo`; o de classes confirmou 72 classes no CSS compilado. Restauro foi conferido estaticamente, sem operação real de backup/restauração.
- Lint: zero erros e um aviso anterior em `Agenda.jsx`, fora deste escopo. `git diff --check` sem erros.
- Auditoria sintética comparou 720 cenários com a V1, preservando os campos anteriores de apuração. A exceção intencional é a correção dos IDs financeiros duplicados, coberta por regressões específicas.

Os scripts reproduzíveis ficam em `tests/browser/central-comercial.mjs`, `tests/browser/dashboard-comercial.mjs`, `tests/browser/resultados-comerciais.mjs` e `tests/browser/graficos-comerciais.mjs`. Exigem o modo de revisão local e um navegador isolado.

## Limites e publicação

- Cabeçalho, navegação e consulta do Dashboard foram conferidos na sessão autenticada do Chrome. Não houve escrita real de meta, atividade, ficha ou compromisso. A consulta revelou que o histórico legado ainda precisa receber a identificação da empresa de origem; seus registros permanecem fora dos indicadores certificados até uma recarga específica autorizada.
- O conteúdo externo do Brief foi bloqueado durante os testes: foram verificados a navegação, a área útil e o isolamento, sem alteração do aplicativo de origem.
- Percentual de aprovação de orçamento e classificações históricas de clientes usam critérios diferentes das vendas certificadas por empresa. As consultas de origem continuam acessíveis em Análises complementares e critérios; não foram fundidas em um indicador sem cobertura comprovada. Ver `migracao-resultados-solucoes.md`.
- Margem/custo, conciliação e comparações sem fonte suficiente continuam indisponíveis. A cobertura real pode limitar rankings e histórico.
- Os benchmarks registrados em `dashboard-fontes.md` medem apenas o motor local com dados fictícios. Não são promessa de latência em produção.
- Servidor foi publicado e conferido antes da interface. A atualização dos históricos sem empresa não foi executada nesta publicação; exige autorização específica e recuperação prevista. Não confundir a publicação dos recursos com a confirmação dos dados legados.

## Refinamento do período e dos acentos visuais

Após a revisão da prévia, o período foi retirado do bloco recolhível: Mês, Ano, Todos os anos e Personalizado ficam visíveis, com emojis decorativos e estado acessível. Mês e ano usam seletores claros, setas anterior/próximo e retorno ao período atual. A virada dezembro/janeiro atualiza os dois campos, sem perder a carteira. O modo Todos mostra os anos conhecidos sem prometer cobertura integral. Filtros de vendedor, cliente e produto ficam na área avançada.

Navegação, análises e KPIs receberam ícones e acentos por assunto, com contraste no tema escuro. Verificação deste ajuste: 21 regressões focadas e 18 cenários de navegador aprovados, sem erros JavaScript; build oficial e conferência de classes aprovados. Lint sem erros, com o aviso anterior em Agenda.jsx. Sem alteração dos cálculos, dados reais ou publicação.

## Publicação autorizada e cabeçalho

Autorizada pelo dono em 17/10/2026, incluindo o cabeçalho com Silk, fundo azul-escuro e ações preservadas. Banner conferido em 1440, 390 e 320 px, modo escuro, imagem carregada, título único, Atualizar e Novo orçamento/cancelar, sem gravação real. Build oficial aprovado; lint sem erros e aviso anterior em Agenda.jsx.

Servidor publicado antes da interface: painel-comercial v69 ACTIVE (18/18 arquivos iguais à fonte local) e painel-cache v145 ACTIVE (1/1 arquivo igual). Autenticação própria preservada. Verificação recente de 66 cenários do backend aprovada. Interface publicada no commit 2a583ad: Pages 39047156593 e Functions 39047156629 concluídos com sucesso. Os 141 arquivos servidos são idênticos ao build oficial. Após a publicação automática, painel-comercial v70 ACTIVE (18/18 arquivos iguais) e painel-cache v146 ACTIVE (1/1 arquivo igual); ambas as funções mantêm rejeição 401 sem autenticação. Cabeçalho confirmado visualmente em produção na sessão do Chrome. A recarga do histórico legado foi preparada como próximo passo e depende de autorização específica.

## Correção da ausência de cobertura

A conferência autenticada identificou um estado de apresentação incorreto: o realizado da meta podia aparecer como zero quando não existia nenhuma venda confirmada e a cobertura estava incompleta. Agora permanece indisponível. Valores parciais observados e zeros comprovados são preservados; os filtros de empresa e carteira não foram relaxados. A evolução de vendas também apresenta uma mensagem de ausência de dados quando todo o recorte está indisponível.

Verificação: 75 testes focados aprovados, incluindo os seis casos de regressão de ausência, zero real e cobertura parcial; build oficial, lint do componente e diff aprovados. Servidor corrigido publicado antes da interface: painel-comercial v71 ACTIVE e 18/18 arquivos idênticos à fonte validada. A atualização do cache legado continua dependente de autorização específica; nenhum registro real foi alterado.

Publicação final da correção: código 31d7d27; Pages 39048175524 e Functions 39048175529 aprovados. Os 141 arquivos públicos são idênticos ao build. painel-comercial v72 ACTIVE (18/18 arquivos iguais) e painel-cache v147 ACTIVE (1/1 arquivo igual). Chrome autenticado confirmou a evolução indisponível e o realizado da meta como “Não disponível”, sem erros JavaScript. A aba Visão geral foi deixada aberta com o novo cabeçalho. Nenhuma recarga histórica executada.

## Consolidado autorizado de empresas

Em 17/10/2026 o dono definiu que Impresilk e Universo devem ser tratadas juntas no Comercial. O Dashboard identifica esse consolidado explicitamente e aceita as denominações exatas das duas empresas. Totais, séries, rankings, comparações, metas, funil e detalhe seguem os mesmos filtros de período e carteira. A empresa original permanece no cache; não houve alteração de cadastros ou O.S. no ERP. Empresas externas e registros sem origem confirmada continuam fora dos totais certificados.

81 testes focados aprovados, incluindo soma das duas empresas, exclusão de empresas com nomes semelhantes, carteira de vendedor, séries, ranking, funil e consulta financeira. Build e lint aprovados. Servidor v75 ACTIVE, 18/18 arquivos conferidos antes da tela. A recarga comercial de 2020 a 2026 foi autorizada separadamente, com snapshot privado e plano de recuperação.

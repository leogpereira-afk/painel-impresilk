# Central Comercial V2 — entrega local

Revisão de 17/10/2026 no ramo `codex/central-comercial`, continuando a V1 local `6aa7a27`. Implementação e prévia com dados fictícios. **Não publicada; nenhum registro real foi alterado.**

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

- Não houve validação autenticada em produção nem escrita real de meta, atividade, ficha ou compromisso. A prévia não comprova disponibilidade das fontes reais.
- O conteúdo externo do Brief foi bloqueado durante os testes: foram verificados a navegação, a área útil e o isolamento, sem alteração do aplicativo de origem.
- Percentual de aprovação de orçamento e classificações históricas de clientes usam critérios diferentes das vendas certificadas por empresa. As consultas de origem continuam acessíveis em Análises complementares e critérios; não foram fundidas em um indicador sem cobertura comprovada. Ver `migracao-resultados-solucoes.md`.
- Margem/custo, conciliação e comparações sem fonte suficiente continuam indisponíveis. A cobertura real pode limitar rankings e histórico.
- Os benchmarks registrados em `dashboard-fontes.md` medem apenas o motor local com dados fictícios. Não são promessa de latência em produção.
- Publicação depende de autorização posterior. Como a interface utiliza novas ações e campos, é necessário publicar e conferir `painel-comercial` e seus módulos compartilhados antes da interface; depois conferir a versão servida e os fluxos autenticados sem criar dados de teste reais.

## Refinamento do período e dos acentos visuais

Após a revisão da prévia, o período foi retirado do bloco recolhível: Mês, Ano, Todos os anos e Personalizado ficam visíveis, com emojis decorativos e estado acessível. Mês e ano usam seletores claros, setas anterior/próximo e retorno ao período atual. A virada dezembro/janeiro atualiza os dois campos, sem perder a carteira. O modo Todos mostra os anos conhecidos sem prometer cobertura integral. Filtros de vendedor, cliente e produto ficam na área avançada.

Navegação, análises e KPIs receberam ícones e acentos por assunto, com contraste no tema escuro. Verificação deste ajuste: 21 regressões focadas e 18 cenários de navegador aprovados, sem erros JavaScript; build oficial e conferência de classes aprovados. Lint sem erros, com o aviso anterior em Agenda.jsx. Sem alteração dos cálculos, dados reais ou publicação.

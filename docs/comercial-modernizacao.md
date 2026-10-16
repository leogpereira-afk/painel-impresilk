# Modernização do Comercial — 15/10/2026

Autorizada por Léo, mantendo todas as ideias e funções. Publicação autorizada por Léo com “pode subir”.

## Organização

Meu dia (antigo Meu painel); Negociações com Orçamentos e Prospecção; Clientes; Pós-venda; Resultados com Minhas vendas e Minhas metas; Soluções com Produtos e soluções. Os valores de aba na URL e as entradas antigas continuam preservados. Atalhos e materiais recolhem Calendário, Compromissos, Pagamentos atrasados, Brief e Dicas, mantendo permissões originais.

Na fila, Registrar contato é a ação principal. Orçamento, Cliente, reagendamento e conclusão continuam em Mais opções. Minha fila, Atrasados e Hoje ficam à vista; os outros filtros e o funil continuam em Mais. Indicadores, tabelas, formulários e listas compartilham uma camada visual compacta, com estados explícitos, foco visível e respeito à redução de movimento. Nenhuma biblioteca nova ou efeito de animação pesado.

A camada visual está em src/pages/comercial-workspace.css. Componentes de cálculo, gravação e autorização não foram alterados nesta modernização. Os ajustes locais anteriores do pós-venda, inclusive recorte no servidor, foram preservados e foram implantados no servidor antes da tela: painel-comercial v60 ACTIVE, 15/15 arquivos conferidos.

## Verificação e limites

194 testes do Comercial e pós-venda passaram, zero ignorados. Build e lint dos componentes alterados aprovados. Prévia fictícia conferiu todas as áreas, subabas, abertura/cancelamento de atendimento e campos preenchidos. Celular de 390 px sem transbordamento horizontal nas seis áreas principais. Não foram gravados dados reais. Verificação de publicação: 1.448 regressões e 653 testes de cálculo/acesso passaram; build oficial e verificadores aprovados. Não houve avaliação de adesão com vendedores; melhoria visual não comprova aumento de uso.

# Central Comercial — entrega local

Data: 17/10/2026. Ramo `codex/central-comercial`, base `0f6ce56`. Implementado e testado localmente. Não publicado; sem escrita de registros reais, importação retroativa, migração ou concessão de permissões.

## Funcionalidades entregues

- Comercial permanece na lateral. Navegação superior: Visão geral, Bancos e Pix, Glossário, Contas atrasadas, Brief e Dashboard. As quatro ferramentas saem da lateral e mantêm rotas antigas, permissões e funcionalidades completas.
- Apenas a tela aberta é montada. Links diretos, Voltar e filtros são preservados; a entrada funciona também para um perfil autorizado somente a Bancos.
- Meu dia, Negociações, Clientes, Pós-venda, Resultados e Soluções permanecem. Resultados aponta ao Dashboard para evitar duplicar análises, preservando metas e os detalhes operacionais.
- Dashboard: Panorama, Produtos, Vendedores, Clientes, Atrasos, Curva ABC, Histórico e Oportunidades. Períodos de mês, ano, todos os anos disponíveis e datas personalizadas; filtros de vendedor, cliente, produto, categoria e campanha conforme acesso.
- Rankings com evolução mensal/anual, ticket, participação, quantidades por unidade comprovada, frequência, última compra e ABC configurável. Histórico em matriz, comparações com períodos equivalentes, metas cadastradas e detalhe paginado das O.S.
- Prioridades com evidência, recompra por intervalo habitual, sugestões de mix entre compradores, concentração, produtos em queda, sazonalidade e simulador de metas sem alterar a meta registrada.
- Sistema visual local com tokens, cards compactos, densidade confortável/compacta, navegação responsiva, foco, modal com Escape/restauração do foco, detalhes recolhíveis e movimento reduzido.
- Consultas agregadas no servidor, leitura paginada, cancelamento de solicitações antigas e cache curto por sessão/permissões/filtros, invalidado após alterações comerciais e mudança de sessão.

## Integridade dos dados

Venda usa O.S. normal, não cancelada, pela data de cadastro; líquido, bruto e desconto são distintos. Faturamento, recebimento e orçamento não substituem venda. Registros de outras empresas ficam fora dos totais; empresa desconhecida fica separada e impede afirmar cobertura completa.

O rateio conserva centavos. Ausência não vira zero. A abertura do detalhe conserva filtros e a interseção exata das datas, inclusive ao selecionar um mês dentro de período personalizado. Linhas repetidas do mesmo produto permanecem visíveis. O financeiro exige acesso próprio e vínculos suficientes; não se atribui saldo de um título ao produto por suposição.

Contrato detalhado: [dashboard-fontes.md](dashboard-fontes.md).

## Verificação final

| Verificação | Resultado |
|---|---|
| `TZ=UTC node --test tests/*.test.mjs` | 1.521 aprovados, zero falhas/ignorados |
| Rodada de cálculos e regressões comerciais (`src/lib/calc/*.test.mjs`, `tests/comercial*.test.mjs`, `tests/dashboard*.test.mjs`, Central, carga e canceladas) | 879 aprovados, zero falhas/ignorados |
| `node --test src/lib/acesso-state.test.mjs` | 7 aprovados |
| `tests/browser/dashboard-comercial.mjs` | 11 cenários aprovados, zero erros JavaScript |
| `tests/browser/central-comercial.mjs` | URLs legadas, Back, filtros, montagem sob demanda, acesso restrito, Brief e mobile conferidos |
| Build Vite com `BASE_PATH=/painel-impresilk/` | Aprovado |
| ESLint completo | Zero erros; um aviso anterior em `Agenda.jsx` sobre cleanup de ref |
| Quinze verificadores do projeto e `git diff --check` | Aprovados |
| Revisão independente de fontes, backend e interface | Achados materiais corrigidos e conferidos |

As rodadas de 1.521 e 879 compartilham testes; não representam uma contagem única somável. Os testes de navegador utilizam dados fictícios, o motor real e bloqueio de rede externa. Não comprovam uma operação autenticada em produção.

O verificador de sistemas encontrou sete divergências ao consultar a cópia local antiga da Central do Léo (25/09). Sem modificar esse repositório, a conferência foi repetida contra `equipe-auth/index.ts` da main atual de `vida-leo`, blob `8256f428c1d311badefb18ec92211394a72dccf3`: os 11 sistemas, seus papéis e 22 módulos coincidiram. A falha inicial era da referência de teste desatualizada.

## Desempenho medido

Em 12 medições controladas de builds de demonstração, a remoção do carregamento antecipado de módulos reduziu o JavaScript solicitado após 4,5 segundos em **58,43% no Comercial** e **66,03% em Bancos**. O volume inicial aumentou um pouco; os tempos variaram e não comprovam ganho de latência. Resultado e método: [validacao-central-comercial.md](validacao-central-comercial.md).

## Limitações e preparação da publicação

1. Os importadores agora preservam a empresa declarada pela origem. O histórico já armazenado sem essa identidade não foi preenchido retroativamente. Uma nova carga deve ser autorizada, ter cobertura conferida e ser conciliada com a origem antes de apresentar histórico completo. Não inferir empresa por cliente ou vendedor.
2. Quantidades sem unidade comprovada, custos/margem, motivos de perda, conversão por coorte e vínculos financeiros insuficientes permanecem indisponíveis. A tela explica a limitação; não há previsão de margem inventada.
3. O índice de atraso usa somente títulos sincronizados e comprovadamente vinculados ao recorte; não é toda a dívida da empresa nem uma posição financeira histórica.
4. O servidor recusa histórico acima do limite de segurança de 100 mil O.S.; rankings declaram o recorte de até 500 grupos e os detalhes são paginados. Não apresentar truncamento como cobertura total.
5. O Brief foi conferido como área integrada e responsiva; seu login/fluxo externo não foi executado no teste que bloqueia origens externas.
6. Antes de publicar, atualizar e conferir novamente a main e a vez. Publicar `painel-comercial` e `painel-cache` antes da interface que depende das novas ações; conferir versões e conteúdo servido. Não há migração de banco nesta entrega.
7. Depois da autorização, conferir as fontes reais e a interface autenticada somente por leitura. Qualquer atualização retroativa de dados deve ter escopo e recuperação definidos. Não usar registros reais para demonstrar gravações.

Prévia local: `http://127.0.0.1:4281/revisao-local.html#/comercial/dashboard`. Ela depende do servidor local de revisão estar ligado e mostra dados fictícios.

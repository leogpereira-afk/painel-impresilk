# Comercial Impresilk — entrega para revisão

Data: 11/10/2026. Estado: três etapas publicadas com autorização de Léo ("subir"), após a revisão local. Servidor e tela oficiais conferidos em 11/10/2026. O atalho do Brief anteriormente aprovado já estava publicado e foi preservado.

## O que mudou

**Rotina diária.** Minha agenda e oportunidades mostra uma fila compacta, com cliente, orçamento/pedido, responsável, valor conhecido, etapa, contato confirmado, próxima providência e motivo da prioridade. Retornos atrasados e de hoje, validade, pendências e ausência de próximo passo usam a mesma base dos indicadores. A mudança do período de vendas não esconde atividades antigas.

**Atendimento.** Registro rápido com resultado padronizado, observação e próximo passo. Uma espera exige justificativa e revisão. Reagendar conserva ID/versão do acompanhamento; confirmar contato acrescenta histórico no servidor. WhatsApp prepara uma mensagem para revisão e não confirma atendimento ao abrir. Calendário e Compromissos projetam as ações originais e voltam ao mesmo registro.

**Orçamentos.** Lista de trabalho e lista do período separadas, filtros de situação e etapa, validade e contato reais, motivo de perda e versões quando o vínculo de revisão é explícito. A revisão mantém a negociação e ações originais. Ausência de resposta gera alerta, sem perda automática. Orçamentos sem data ficam para conferência, sem atribuição a um mês ou taxa de aprovação falsa.

**Metas.** Participantes, metas faltantes, pessoas excluídas e vínculos incertos aparecem com motivo. Meta ausente, zero e fonte indisponível têm estados distintos. Numerador e denominador usam os mesmos vendedores. Percentual consolidado e ritmo diário ficam indisponíveis com cobertura incompleta. Calendário de trabalho permite dias da semana, feriados e exceções. A direção cadastra metas em um único lugar no Painel.

**Vendas.** Valores em reais com duas casas, pedidos por ID, ticket, evolução e comparação por datas, dias úteis equivalentes ou meses completos. Venda líquida, sinal, recebimento e saldo são apresentados separadamente; recebimento exige conciliação comprovada. Aprovação registrada informa a base e permite abrir cada situação. Clientes novos, recorrentes e reativados exigem histórico suficiente e critério explícito. Produtos mais vendidos abrem os pedidos do cálculo, contando uma O.S. apenas uma vez mesmo com várias linhas do produto.

**Clientes, prospecção e pós-venda.** Histórico autorizado sob demanda e paginado, compras anteriores ao mês selecionado, canais, contatos, orçamentos e próximos passos. Reativação usa regra configurada e frequência quando comprovada. Sugestões explicam cobertura e motivo e reutilizam ações existentes. Pós-venda verifica entrega efetiva no PCP, independentemente do período de vendas, e não se baseia somente em baixa no ERP.

**Operação e produtos.** Consulta do mesmo pedido mostra responsável do PCP, situação, previsão estimada, prazo confirmado e conclusão efetiva separados. Checklist de passagem auxilia a conferência e mantém o acesso ao Brief. Fichas vinculadas ao ID do produto permitem conteúdo técnico conferido, materiais, aplicações, perguntas, cuidados, fotos autorizadas e complementos. A consulta de produto permite retornar ao orçamento original.

**Navegação e confiança.** Buscas e filtros por aba permanecem na URL. Indicadores abrem seus registros. Falha de consulta é diferente de lista vazia; a última cópia válida fica limitada ao mesmo contexto. Mudança de usuário, carteira ou permissão remonta o módulo e encerra consultas/formulários antigos. Layout mais compacto, detalhes recolhíveis e celular de 390 px conferidos.

## Integrações reaproveitadas

- Mubisys: catálogo e IDs existentes de vendedores, clientes, produtos, orçamentos e O.S.; fontes e janelas de sincronização já existentes.
- Painel/Supabase: ações, histórico, RPC de gravação com concorrência por versão, configuração e metas existentes; mesmas permissões.
- Calendário e Compromissos: projeção das ações comerciais, sem copiar cadastros ou criar outro acompanhamento.
- PCP: leitura mínima autorizada, vinculada ao pedido comercial. Se o PCP não guardar ID ERP, um vínculo por número só é aceito com uma O.S. comercial global e um registro PCP inequívocos; duplicidade impede associação.
- Financeiro: os títulos e a régua de conciliação existentes, sem presumir pagamento pelo valor vendido.
- Brief: acesso existente preservado. Nenhuma escrita no ERP ou PCP foi acrescentada.

## Dependências que permanecem explícitas

1. A integração consultada não oferece metas oficiais comprovadas do Mubisys. A fonte definida é o cadastro mensal da direção no Painel. Metas e calendário reais precisam ser conferidos/cadastrados pela direção.
2. Conversão de orçamento em pedido, envio confirmado e vínculo entre revisões precisam de identificação oficial. O sistema não deduz vínculo por nome ou valor; aprovação registrada não equivale a conversão em pedido.
3. O PCP consultado não confirma campos estruturados de pendência de arte, medição e aprovação. A tela declara essa ausência e orienta consulta operacional. Declaração de entrega sem conferência não habilita pós-venda.
4. Não há vínculo automático comprovado entre IDs do Brief e dos pedidos. O atalho e a consulta pela O.S. permanecem disponíveis.
5. Fotos, preços, disponibilidade, prazos e conteúdo técnico não disponíveis na fonte permanecem ausentes ou sujeitos à confirmação. A estrutura das fichas está pronta para receber conteúdo autorizado e validado.
6. Dados históricos truncados, pedidos com identificação insuficiente ou datas ausentes impedem indicadores definitivos. Informações conhecidas continuam consultáveis.
7. A publicação das funções deve preceder a tela. A sessão real da Direção foi conferida após a publicação, em leitura e abertura dos formulários sem salvar. Conta restrita real não estava autenticada; perfis restritos e gravações continuam verificados nos testes e na prévia com dados simulados.

## Conferência dos 14 fluxos de aceitação

| Fluxo | Evidência local e limite |
|---|---|
| 1. Retorno em Comercial, cliente, calendário e Compromissos | Chrome e testes de projeção: mesmos IDs e links para a origem. |
| 2. Reagendar sem duplicar ou simular contato | Chrome: mesmo ID no dia novo; carimbo do contato preservado. Concorrência sintética testada. |
| 3. Concluir preservando histórico | Chrome e handler com banco fictício: resultado confirmado, contato no histórico, tarefa fora da fila ativa. |
| 4. WhatsApp sem registrar atendimento | Fluxo e helper conferidos: apenas mensagem preparada; gravação depende de confirmação do resultado. Nenhum envio realizado. |
| 5. Período e validade | Chrome: troca para mês anterior conserva rotina. Teste: retorno futuro não esconde validade vencida. |
| 6. Indicadores e listas | Chrome e revisão independente: IDs e quantidades correspondem; repetição de item do produto não repete pedido. |
| 7. Metas e cobertura | Chrome: ausente, parcialmente cadastrada e completa em memória. Testes: zero, falha, IDs incertos e exclusão de inativo. |
| 8. Dias úteis | Cálculos testam semana, feriados, exceções e períodos equivalentes; calendário ausente bloqueia comparação. |
| 9. Revisão de orçamento | Testes e funções reais de abertura: vínculo explícito conserva valor representativo, ação, versão, contato e briefing. |
| 10. Escopo e transferência | Handlers sintéticos Ana/Bia/direção e perfis da prévia. Remontagem por identidade/permissão/vendedor verificada no JSX real; sessão real da Direção conferida sem gravar; conta restrita real não conferida. |
| 11. Operação e pós-venda | Handler e Chrome: ID original, entrega efetiva, cancelamento e previsão confirmada/estimada distintos. Pós-venda histórico pagina candidatos. |
| 12. Falhas de integração | Handlers e código de consulta: falha distinta de vazio, sem presumir fontes ou expor dados de outro contexto. Não foi interrompida a integração real. |
| 13. Computador e celular | Chrome desktop e 390 px sem transbordamento; modal fecha por Escape; filtros mantidos e produto volta ao orçamento. |
| 14. Verificações e publicação | Testes, build, lint, verificadores e revisão independente aprovados localmente. Servidor publicado antes da tela; workflows, código no ar e sessão real da Direção conferidos após autorização. |

## Verificação executada

- Auditoria: 1.226 casos; 1.142 aprovados, zero falhas, 84 casos condicionais de banco não executados nesta rodada.
- Cálculos: 620 aprovados, zero falhas, zero ignorados.
- Build de produção com caminho oficial: aprovado.
- Lint: zero erros, um aviso já existente em Agenda.jsx.
- Quinze verificadores oficiais do Pages: aprovados; imports e classes repetidos após o build final.
- Revisão independente: F1–F14 corrigidos e encerrados; testes focados e asserções adicionais de funções/SSR/cliques executados. Não houve auditoria independente autenticada em produção.
- Prévia no Chrome com dados inteiramente fictícios. Alterações da demonstração são descartadas ao recarregar.

Nenhum commit, merge, push, implantação, concessão de acesso, envio de mensagem ou alteração de registros reais foi executado nesta reforma. O código está no ramo local codex/comercial-evolucao-20261011, a partir do atalho aprovado bc2c564.

## Publicação e conferência oficial · 11/10/2026

Autorização de Léo: “subir”. Código 3e51a01, integração a25dce5 com Compromissos RH da main 2aeb387, liberação 3894c2a. Servidor publicado antes da tela; funções finais painel-comercial 25, painel-agenda 50, painel-config 126 e painel-dados 121 ACTIVE. Todos os 67 arquivos dos quatro pacotes são idênticos à revisão integrada. GitHub Pages 38178121510 e Edge Functions 38178121497 terminaram com sucesso; HTML e 113 assets oficiais idênticos ao build validado.

Conferência autenticada no Chrome, somente leitura: indicadores e somas de suas listas, oportunidades de meses anteriores, registro rápido com responsável original, histórico de cliente por carteira, metas ausentes sem percentual consolidado, pedido/PCP com entrega efetiva e financeiro conciliado e ficha do catálogo com ausência de validação explícita. Selecionar uma vendedora atualizou números e fila para a carteira selecionada. A tela oficial foi conferida em 390 px, sem transbordamento horizontal. A consulta real de pós-venda retornou pedidos com entrega efetiva, cobertura parcial e paginação de candidatos explícitas. Nenhuma gravação de teste em produção. As quatro portas recusaram suas consultas válidas sem sessão com 401; uma consulta inicial ao painel-dados com formato inválido retornou 400, e foi repetida no formato correto da rota.

Verificação final do código integrado: 1.156 testes de auditoria aprovados, 84 casos condicionais de banco não executados; 621 cálculos e 6 acessos aprovados; build, 15 verificadores e revisão independente do merge aprovados. Lint sem erros e um aviso anterior em Agenda. O revisor repetiu 43 testes focados e 78 asserções de carregamento independente, troca de identidade/carteira e preservação de RH/IDs comerciais. A cópia local antiga de equipe-auth estava desatualizada; a conferência de permissões passou contra a fonte oficial atual, igual à usada pela publicação.

Limites reais: testes de escrita/perfis restritos usam banco e autenticação simulados; faltam os cadastros/validações descritos nas dependências acima. Não houve migração, concessão de acesso, mensagem, escrita no ERP/PCP ou alteração de registros reais.

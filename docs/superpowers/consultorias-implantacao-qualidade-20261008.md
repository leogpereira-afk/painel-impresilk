# Consultorias: implantação, tempo e qualidade

## Situação
Implementação local pronta para revisão em 08/10/2026. Esta segunda atualização ainda não foi publicada. A primeira versão de Demandas e Consultorias permanece em produção.

## Fluxo
1. A equipe interna continua vinculada ao ID canônico do RH.
2. Em Consultores e acesso, cadastrar os consultores externos dentro da própria consultoria. Nome, função e contato opcional; não cria colaborador no RH. Contato só aparece para gestores.
3. Gerar acesso por consultor cadastrado, com validade de até 30 dias e revogação. Os convites antigos continuam válidos até expirar/revogar. Nada é enviado automaticamente.
4. O consultor registra ações, andamento, decisões e pendências, resultados e próximo passo. Pode atualizar a implantação das próprias ações; cada mudança mantém histórico. Materiais permanecem em Arquivos.
5. Em Etapas, o consultor monta o plano: descrição, início previsto, prazo, dependências, início real, término real, progresso e situação. O responsável interno da nova etapa é o responsável RH da ficha; a gestão pode ajustar pela ficha.
6. O prazo entra no calendário existente. Datas reais medem execução. Datas reais futuras, término anterior ao início, dependências circulares e início antes da predecessora concluída são recusados.
7. Consultor pode marcar Pronta para conferência; conclusão depende da equipe interna. Etapas validadas só são reabertas pela gestão.
8. Gestão avalia cada etapa de 0 a 10, com comentário obrigatório. Abaixo de 6: precisa melhorar (vermelho); 6 a 8,9: bom (azul); 9 a 10: excelente (verde). Os textos acompanham as cores.
9. A nota e o comentário são visíveis ao consultor para orientar ajustes. Só gestor interno pode avaliar. O histórico de avaliações é preservado. Avaliar não conclui etapa nem muda seu progresso.

## Painel visual
- Progresso: média simples dos percentuais das etapas, com pesos iguais. Pronta/validada equivale a 100%.
- Etapas prontas, validadas e em aberto com atraso são contagens distintas.
- Linha do tempo com previsto em roxo e realizado em verde; datas legíveis junto das barras.
- Duração média apenas das etapas prontas com datas reais válidas. Dias corridos inclusivos, contando início e fim.
- Qualidade: média da última avaliação de cada etapa avaliada. Sem nota não vira zero. Quantidade avaliada e etapas abaixo de 6 ficam explícitas.
- Recomendações calculadas a partir dos registros visíveis: atrasos, bloqueios, conferências pendentes, próximo passo disponível e falta de evidências. Não há chamada de IA nem custo de tokens.
- Cards compactos, navegação por Resumo / Ações / Etapas / Arquivos / Consultores e acesso; detalhes recolhíveis. Formulários de ação e etapa preservam rascunho ao trocar de aba.

## Segurança e compatibilidade
- Acesso externo limitado ao processo do convite; servidor valida o escopo em cada operação.
- Avaliações e metadados são preservados pelo servidor quando se edita a ficha ou o planejamento. Tentativas externas de atribuir notas são rejeitadas.
- Escritas têm versão e comparação atômica; conflito exige atualizar, sem sobrescrever silenciosamente.
- Ações e etapas continuam separadas: informar uma implantação não valida automaticamente uma entrega.
- Sem migração de banco, exclusão ou alteração em massa. Nenhum dado real foi criado para testar.
- Publicação precisa atualizar somente painel-processos e o frontend. O workflow genérico de functions também publica funções do PCP: usar publicação seletiva e manter o procedimento documentado da primeira entrega.

## Verificação
- Suíte final: 838 testes, 827 aprovados, 11 ignorados pela configuração existente, zero falhas.
- 15 verificadores do projeto aprovados; build de produção com BASE_PATH=/painel-impresilk/ aprovado.
- Lint sem erros; dois avisos existentes de hooks em Agenda e CalendarioEmpresa.
- Chrome, dados fictícios: cadastro de consultor; avaliação 9/10 com comentário; edição de etapa existente, datas reais de 01/10 a 08/10, conclusão interna, cálculo de oito dias e preservação da nota.
- Portal externo: criação de etapa com 60% (média do processo 30%, duas etapas), registro de ação e implantação em andamento. Sem controles administrativos ou avaliação externa.
- Portal em viewport móvel: largura do conteúdo igual à largura disponível, sem transbordamento horizontal.
- Corrigido durante a revisão: o ID da etapa no editor sobrepunha o ID do processo no envio. O contexto da ficha agora prevalece; o mesmo fluxo foi repetido com sucesso.
- Falha transitória do verificador de CSS ocorreu ao executá-lo simultaneamente ao build que recriava dist. Executado após o build, passou; nenhum ajuste de código foi necessário.
- Logs antigos de atualização a quente da prévia foram observados; após recarregar, os fluxos acima foram executados sem novo erro de renderização.

# Licitações & Indústrias — documentos e salvamento

Prévia local concluída em 04/11/2026. Sem commit, publicação, migração externa ou alteração de registros reais.

## Entrega

- Documentos com visualizar, baixar, editar e renovar separados; busca sem acentos; categorias por finalidade; emissão, validade, responsável e situação visíveis. Detalhes e versões recolhíveis.
- Responsável selecionado entre pessoas do RH, com ID/nome preservados. Vínculos legados permanecem legíveis.
- Kits privados por edital e empresa, requisitos explícitos, documentos faltantes e dispensa com justificativa. Cada vínculo conserva a versão usada, inclusive após renovação.
- Download ZIP com arquivos autorizados, índice UTF-8 e pendências. Limites de 40 MiB e 79 documentos mais o índice; documento individual respeita o limite existente de 3 MB.
- Cadastros mostram validade e download dos documentos vinculados. Navegação móvel em seletor, detalhes recolhíveis e ações de toque legíveis.
- Salvamento com versão e comparação atômica. Mescla preserva alterações independentes; conflitos reais exigem escolha explícita. Validade/sem-vencimento e ID/nome do responsável são conjuntos indivisíveis.
- Resultado de gravação incerto mantém bytes e rascunho; a aplicação não elimina um anexo que pode ter sido confirmado. Sessão e permissão são revalidadas durante operações e downloads.
- Acompanhamento preserva textos, anexos de edital, campos remotos e formulários diante de resposta atrasada. Valores estimados e contratados são distintos.

## Verificação final

| Conferência | Resultado |
| --- | --- |
| Testes focais finais de documentos, licitações e ZIP | 464 aprovados; zero falhas |
| Suíte geral de regressão, antes dos últimos ajustes focais | 2.207 aprovados; zero falhas |
| Suíte de cálculos do projeto | 1.496 aprovados; zero falhas |
| Revisão independente das correções finais | 34 testes pertinentes aprovados; nenhum P1/P2 residual encontrado |
| ESLint de src | Zero erros; um aviso preexistente em Agenda.jsx:168 |
| Build oficial | Aprovado |
| Build da revisão | Aprovado |
| git diff --check | Sem erros |

Ensaios automatizados cobrem conflitos concorrentes, repetição de criação, arquivos de resultado incerto, sessão revogada, empresas/permissões incorretas, versão histórica, backup/restauração local e ZIP incompleto. O ensaio de PostgreSQL usa PGlite local. Não representa validação produtiva.

## Conferência no navegador

- Sete abas sem transbordamento em 390 px; Cadastros também conferido em 320 px. Documentos e kits conferidos novamente em 390 e 1280 px, sem controles para fora da largura.
- Novo kit criado em largura móvel; requisito, referência do edital e versão do documento preservados ao reabrir.
- Documento editado com responsável do RH e validade; dados visíveis após salvar. Campo de data conferido também pelo controle nativo.
- Renovação com PDF sintético concluída; novo arquivo e versões anteriores visíveis. Kit criado antes da renovação conservou a validade e versão originalmente escolhidas.
- Download individual e ZIP realizados. ZIP lido por verificador independente: duas entradas PDF válidas e índice; CRC sem erro, índice inclui pendência.
- Acompanhamento editado e reaberto com observações, acentos e checklist preservados. Atalho de kit abre o edital correto.
- Visualização de PDF oferece download alternativo quando o navegador não incorpora o leitor.

Conflitos simultâneos e revogação de sessão foram exercitados nos testes automatizados, não por duas sessões autenticadas de produção.

## Limites e continuidade

A revisão usa somente dados fictícios em memória; recarregar descarta as alterações da demonstração. Nenhuma certidão real, validade oficial, inscrição em portal ou proposta foi enviada. Download de kit não declara habilitação.

Antes de eventual publicação, reler origin/main e o protocolo, conciliar a publicação documental paralela e aplicar a migração atômica de participação anterior à função. Publicar servidor compatível antes da interface. A conferência com sessão e dados reais permanece para a etapa autorizada de publicação.

As alterações anteriores da prévia foram preservadas; há cópia local do estado de entrada fora do Git. Arquivos de resultado incerto podem exigir conciliação posterior; a correção prioriza preservar dados, sem limpeza automática destrutiva.

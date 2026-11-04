# Licitações & Indústrias — documentos e salvamento

Publicado e conferido em 04/11/2026 após aprovação da prévia. Implementação 308a198 e correção final 85fba83. As seções de prévia abaixo registram os ensaios anteriores à publicação; a conferência oficial está ao final.

## Entrega

- Documentos com visualizar, baixar, editar e renovar separados; busca sem acentos; categorias por finalidade; emissão, validade, responsável e situação visíveis. Detalhes e versões recolhíveis.
- Responsável selecionado entre pessoas do RH, com ID/nome preservados. Vínculos legados permanecem legíveis.
- Kits privados por edital e empresa, requisitos explícitos, documentos faltantes e dispensa com justificativa. Cada vínculo conserva a versão usada, inclusive após renovação.
- Download ZIP com arquivos autorizados, índice UTF-8 e pendências. Limites de 40 MiB e 79 documentos mais o índice; documento individual respeita o limite existente de 3 MB.
- Cadastros mostram validade e download dos documentos vinculados. Navegação móvel em seletor, detalhes recolhíveis e ações de toque legíveis.
- Salvamento com versão e comparação atômica. Mescla preserva alterações independentes; conflitos reais exigem escolha explícita. Validade/sem-vencimento e ID/nome do responsável são conjuntos indivisíveis.
- Resultado de gravação incerto mantém bytes e rascunho; a aplicação não elimina um anexo que pode ter sido confirmado. Sessão e permissão são revalidadas durante operações e downloads.
- Acompanhamento preserva textos, anexos de edital, campos remotos e formulários diante de resposta atrasada. Valores estimados e contratados são distintos.

## Verificação da prévia

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

## Conferência da prévia no navegador

- Sete abas sem transbordamento em 390 px; Cadastros também conferido em 320 px. Documentos e kits conferidos novamente em 390 e 1280 px, sem controles para fora da largura.
- Novo kit criado em largura móvel; requisito, referência do edital e versão do documento preservados ao reabrir.
- Documento editado com responsável do RH e validade; dados visíveis após salvar. Campo de data conferido também pelo controle nativo.
- Renovação com PDF sintético concluída; novo arquivo e versões anteriores visíveis. Kit criado antes da renovação conservou a validade e versão originalmente escolhidas.
- Download individual e ZIP realizados. ZIP lido por verificador independente: duas entradas PDF válidas e índice; CRC sem erro, índice inclui pendência.
- Acompanhamento editado e reaberto com observações, acentos e checklist preservados. Atalho de kit abre o edital correto.
- Visualização de PDF oferece download alternativo quando o navegador não incorpora o leitor.

Conflitos simultâneos e revogação de sessão foram exercitados nos testes automatizados, não por duas sessões autenticadas de produção.

## Limites e continuidade

A revisão local usa somente dados fictícios em memória; recarregar descarta as alterações da demonstração. A etapa oficial posterior usou cadastros sintéticos identificados, sem modificar documentos reais. Nenhuma inscrição em portal ou proposta foi enviada. Download de kit não declara habilitação.

Na publicação, origin/main e protocolo foram relidos, a publicação documental paralela foi preservada e a migração atômica de participação antecedeu a função e a interface. O servidor compatível foi conferido antes da liberação da tela.

As alterações anteriores da prévia foram preservadas; há cópia local do estado de entrada fora do Git. Arquivos de resultado incerto podem exigir conciliação posterior; a correção prioriza preservar dados, sem limpeza automática destrutiva.

## Publicação e ajuste encontrado no oficial — 04/11/2026

Release 308a198 publicado após aprovação. Pages 41812932386 e Functions 41812932140 concluídos; 223 arquivos públicos iguais ao build e 50 arquivos dos dois servidores conferidos. Suíte de release: 2.210 regressões, 1.496 cálculos, 7 testes de acesso e 15 verificadores aprovados.

O ensaio autenticado confirmou salvamento após recarregar, download individual e ZIP, validade atualizada e kit preservando a versão anterior. A comparação dos registros anteriores à publicação permaneceu igual. Durante a renovação, a ordem das chaves retornadas por JSONB fazia a comparação textual criar um snapshot redundante, sem perda dos arquivos.

Correção restrita à comparação estrutural, preservando a ordem das listas e todas as versões existentes. Teste reproduziu a falha antes do ajuste. 141 testes relacionados aprovados, incluindo diferenças reais de metadados e downloads. Servidor publicado antes do reteste final; nenhum histórico existente foi apagado ou deduplicado.

## Conferência final da publicação

- Correção 85fba83: Pages 41827882173 e Functions 41827882224 concluídos com sucesso. Todos os 223 arquivos públicos coincidem por SHA-256 com o build aprovado.
- Servidores painel-ativos v187 e painel-agenda v129 ACTIVE; os 27 e 23 arquivos, respectivamente, coincidem com os pacotes aprovados. Requisições sem sessão recebem 401.
- Novo documento, datas e kit salvos no oficial e recuperados após recarregar. Renovação após a correção acrescentou exatamente uma versão, preservando integralmente as anteriores.
- PDFs atual e históricos baixados com bytes iguais aos originais sintéticos. ZIP antes e depois da renovação passou na conferência de CRC, índice e hash do PDF; o kit conservou a validade e a versão originalmente escolhidas.
- Edição do kit preservou seus vínculos e acrescentou o evento ao histórico. Console sem erros nos fluxos conferidos.
- Comparação antes/depois preservou os registros existentes e as referências/metadados dos arquivos no recorte acompanhado. Não houve alteração de documentos reais nem de históricos existentes.
- Os cadastros sintéticos foram movidos para lixeiras recuperáveis, conservando integralmente seus dados, versões e arquivos. Nenhum teste ficou na lista ativa. Evidências privadas fora do Git.

Os ensaios concorrentes e de revogação de sessão continuam cobertos pelos testes automatizados; não houve teste simultâneo com duas contas reais em produção. O aviso preexistente de ESLint em Agenda.jsx não faz parte desta mudança.

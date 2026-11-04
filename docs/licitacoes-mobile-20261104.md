# Licitações & Indústrias — revisão móvel

Prévia local concluída em 04/11/2026, sobre a base `72a099f`. Escopo: melhorar leitura e operação no celular, especialmente documentos e kits, mantendo informações, versões e históricos. A compactação anterior de Cadastros foi preservada. Não publicado.

## Alterações

- Formulários de documentos, kits e acompanhamento com campos de 16 px e controles de toque de pelo menos 44 px nos pontos ajustados. Data e horário ficam em linhas separadas nas telas mais estreitas.
- Documentos com ações organizadas, nomes longos quebrando linha, nome completo do arquivo selecionado e rodapé de salvamento acessível durante a rolagem.
- Requisitos de kits recolhíveis, com categoria, documento e situação no resumo. Requisitos completos começam recolhidos; pendentes começam abertos. O indicador de abrir/recolher é explícito, inclusive onde o reset global ocultava a seta nativa.
- Campos dos requisitos permanecem montados ao recolher. A validação nativa abre imediatamente o requisito inválido para permitir o foco, sem apagar o rascunho.
- Nome do edital e da empresa selecionados visíveis integralmente. A orientação para vincular outro documento pede primeiro salvar o kit parcial.
- Checklist com área de toque maior, seletor de cidade legível e alertas de pendências das empresas também visíveis nas linhas móveis.

Nenhuma mudança em esquema, serviços, permissões, payloads ou regras de gravação. Snapshots, versões e comparação de versão no salvamento permanecem como antes.

## Validação

| Conferência | Resultado |
| --- | --- |
| Testes pertinentes a documentos, kits, acompanhamento, cadastros, regiões, empresas, agenda e ZIP | 256 aprovados, zero falhas |
| Novos testes de kit recolhível | Preservação do rascunho/versão/snapshot e reabertura do requisito inválido aprovadas; detectam a ausência do comportamento na base anterior |
| ESLint de `src` | Zero erros; aviso preexistente em `Agenda.jsx:168` |
| Build de produção, base `/painel-impresilk/`, saída `dist` | Aprovado após o último ajuste visual |
| Build de revisão, saída `dist-review` | Aprovado após o último ajuste visual |
| Revisão independente e `git diff --check` | Sem falha bloqueante identificada e sem erros de formatação |

Os builds mantêm o aviso de tamanho de alguns chunks; não houve falha de compilação. Os testes não foram repetidos após o último ajuste exclusivo de CSS, que apenas acrescentou a seta do requisito.

## Conferência no navegador

- Acompanhamento, Pesquisar oportunidades, Regiões, Empresas, Resultados, Documentos e Cadastros conferidos em larguras de 320 e 390 px, sem transbordamento horizontal da página.
- Edição de metadados do documento e renovação com PDF sintético de nome longo; validade nova e versões anteriores preservadas.
- Kit existente manteve o snapshot anterior à renovação. Novo kit salvo e reaberto; texto e versão escolhida permaneceram iguais após recolher e reabrir o requisito.
- Campo obrigatório vazio em requisito recolhido: Salvar reabriu o requisito e focou o campo inválido. Depois de preenchido, o kit foi salvo.
- Observações e checklist de acompanhamento salvos e reabertos com o conteúdo preservado.
- PDF individual e ZIP com dois PDFs e índice baixados; conteúdo dos arquivos e CRC do ZIP conferidos.

## Limites

Esta é uma prévia com dados fictícios e serviços simulados em memória. Salvar e reabrir demonstram o fluxo local; recarregar a demonstração descarta suas alterações. Não houve gravação, sincronização ou teste com duas sessões em produção, nem teste em aparelho físico. A conferência móvel usa a largura do navegador e não substitui a validação final em Safari/Chrome de um celular real.

Nenhum registro, arquivo real ou histórico produtivo foi alterado. Publicação depende da aprovação desta prévia. Os logs e artefatos de conferência ficam fora do repositório público, em `/tmp/licitacoes-mobile-20261104/`.

## Publicação autorizada

Léo aprovou a publicação desta prévia em 04/11/2026. Base oficial `72a099f` atualizada e protocolo relido; a liberação contém apenas a revisão aprovada. Verificação fresca antes de publicar: 2.215 testes gerais, 1.496 cálculos e sete testes de acesso aprovados; quinze verificadores, build com base oficial e revisão independente aprovados. ESLint sem erros, com o aviso preexistente de Agenda. Nenhuma função, migração ou registro de produção faz parte da alteração. Conferência da versão servida e da interface oficial será registrada após a publicação.

# Licitações — prévia de organização profissional

Base pública: 2f887a4. Trabalho local em codex/licitacoes-profissional-20261103.

## Escopo

Entrada compacta e sem banner de mascote na área de trabalho. Acompanhamento, pesquisa, resultados, documentos e cadastros em uma navegação. Indicadores de acompanhamento filtram a lista; busca alcança objeto, órgão, edital, responsável e próxima ação. Lista mantém nomes completos, estimativa identificada, data, status, checklist e ações. Resultados preservam a soma de contratos informados, separada das estimativas.

Pesquisa mantém filtros ao alternar de área. Histórico e execução ficam recolhíveis; cobertura parcial permanece visível. Links por relatório e item continuam selecionando a versão e abrindo o detalhe. Seleção explícita de aba prevalece durante a navegação, sem apagar a versão consultada. Os links anteriores aba=documentos/cadastros continuam válidos. Troca de sessão remonta a área e cancela leituras anteriores.

Documentos e Cadastros vieram da prévia anterior em /tmp/painel-licitacoes-documentos-20261103, copiada sem alterar o clone de origem. Arquivos de serviço e servidor dessa prévia foram mantidos; não são mudanças novas de apresentação. Antes de eventual publicação, revisar essa entrega em conjunto e publicar dependências de servidor antes da interface. Nenhum servidor, acesso ou registro real foi alterado nesta tarefa.

## Verificação

- 245 testes pertinentes aprovados, incluindo permissões, documentos, cadastros, pesquisa, links e filtros.
- Regressão geral: 2.031 testes executados; 2.029 passaram no ambiente restrito. Os dois testes de publicação simulada falharam por EPERM ao abrir servidor em 127.0.0.1. O arquivo correspondente foi repetido com porta local permitida: sete testes aprovados, incluindo ambos. Nenhuma publicação real.
- Lint sem erros; um aviso preexistente em Agenda.jsx. Build e verificadores de preparação de licitação, autenticação e autorização aprovados. Revisão independente corrigiu a largura do botão Editar.
- Navegador: cinco áreas em 320 px sem transbordamento horizontal; 390 px, tema escuro e computador revisados. Formulários e linhas com nomes completos.
- Salvamento fictício de acompanhamento, documento sem arquivo e cadastro de portal confirmado. O documento sem arquivo mantém a necessidade de conferência. Dados de revisão não persistem após recarregar.
- Filtro da pesquisa preservado ao trocar para acompanhamento e voltar. Relatório do histórico mantido após recarga. Link de candidato pendente abriu o detalhe correto.
- PDF baixado em tela móvel e relido: três páginas, identidade da versão selecionada e candidatos pendentes presentes. Gerador de PDF não alterado.
- Console da prévia sem erros na conferência.

## Prévia

http://127.0.0.1:8920/revisao-local.html?cenario=licitacoes-workspace#/licitacoes

Dados de demonstração identificados como fictícios. Sem commit, push ou deploy. Aguarda avaliação da apresentação.

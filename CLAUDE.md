# Protocolo do Painel Impresilk

## Antes de trabalhar

Atualize as referências com `git fetch origin` e leia `origin/main:AGENTS.md`, `origin/main:VEZ.md` e as decisões aplicáveis. Se a vez for de outro agente, pare e consulte o dono. Trabalhe num clone fora do iCloud, em `~/Projetos` ou `/tmp`, com ramo próprio. Preserve alterações de outras sessões e inclua somente arquivos da tarefa em cada commit.

## Registros e segurança

Este repositório é público. Não coloque dados reais, credenciais, documentos privados nem cópias do banco em arquivos versionados. Preserve registros e históricos existentes. Mudanças de dados em produção exigem autorização específica e recuperação prevista. Respeite as permissões no servidor e consulte somente os dados necessários à tarefa.

## Verificação e publicação

Aplique `/Users/leonardopereira/.codex/skills/verification-before-completion/SKILL.md` antes de declarar uma implementação concluída. Confira o comportamento solicitado e as regressões pertinentes. Investigue falhas com `/Users/leonardopereira/.codex/skills/systematic-debugging/SKILL.md`.

Publicação e merge exigem autorização específica. Quando houver alteração no servidor e na tela, confirme a publicação do servidor antes de liberar a tela que depende dele. Uma publicação só está concluída após a verificação da versão em produção; teste local ou commit não comprova publicação.

`AGENTS.md` e `CLAUDE.md` devem ter conteúdo idêntico. Registre a vez e o escopo em `VEZ.md`; não transfira a vez sem decisão do dono.

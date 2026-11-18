# Planejamento anual — verificação local em 18/11/2026

Entrega: prévia local, aguardando avaliação do dono. Nenhum push, deploy, migration produtiva, importação real ou alteração no RH foi executado.

## Verificações executadas

- `node --test tests/planejamento-*.test.mjs tests/calendario-*.test.mjs`: **85 testes aprovados**, sem falhas. Inclui permissões, IDs, dinheiro em centavos, origem preservada, reimportação, transação SQL com PGlite, conflitos, anexos/histórico, calendário e modelo da interface.
- `npm run lint`: sem erros. Um aviso preexistente em `src/pages/Agenda.jsx:168`, sem alteração nesse arquivo.
- `npm run build` e `npm run build:review`: aprovados. Avisos anteriores de tamanho de chunks dos módulos gerais permanecem.
- `git diff --check`: limpo.
- Revisões independentes de servidor/importador e interface: ajustes encontrados foram corrigidos e testados. Busca inclui responsáveis de etapas; limites de ano são coerentes; confirmação de importação é invalidada ao alterar a seleção e bloqueada durante o envio.
- Bundle oficial consultado: não contém o perfil fictício de responsável nem o nome do banco IndexedDB da prévia.

## Ensaio pela interface

Somente dados fictícios no navegador local:

1. Alterar valores previsto e realizado, concluir etapa e salvar. Recarregar e conferir três responsáveis, valores e versão.
2. Anexar PDF à etapa, registrar comentário e recarregar. Baixar o PDF; SHA-256 idêntico ao arquivo original. Histórico de criação, alteração, arquivo e comentário permanece.
3. Abrir a mesma ação pelo calendário. Campanha mensal aparece como intervalo, sem cópias diárias; prazo da etapa concluída deixa de aparecer como pendência.
4. Importar XLSX fictício com 16 ações. Repetir a leitura da mesma planilha: zero novas, zero alteradas e 16 existentes, sem nova gravação.
5. Responsável atualiza situação e recarrega; valores e datas ficam bloqueados. Perfil de leitura não oferece criação nem salvamento. Gestão vê a nova versão e o autor no histórico.
6. Criar outra ação, selecionar duas pessoas pelo ID, informar orçamento único, salvar e recarregar. Os dois vínculos e o orçamento persistem; a ação abre o mês correspondente no calendário.
7. Conferir lista e ficha a 390 px: controles legíveis, sem transbordamento horizontal. Viewport restaurado ao terminar.

O arquivo de planejamento fornecido foi lido fora do repositório: 16 ações, quatro mensais e três sem dia definido; os 16 valores estão ausentes. Leitura e validação pelo domínio concluídas. O conteúdo real não foi importado no banco ou incluído no código público.

## Limites da evidência e próximo passo

Os testes do banco e da função usam serviços locais/simulados. A consulta aos IDs reais do RH, o armazenamento privado e o comportamento autenticado em produção precisam ser conferidos na implantação autorizada, na ordem descrita em `planejamento-anual-operacao.md`.

Prévia: `http://127.0.0.1:5621/revisao-local.html#/calendario-empresa?mes=2027-01&ano=2027&planejamento=1`. Dados de demonstração ficam apenas no navegador local.

# Confirmação de presença e aviso no topo do Painel

A ficha mostrava “A confirmar” sem ação para o convidado. O único caminho era editar o encontro, permitido apenas ao criador e à direção.

## Comportamento

- Botão Confirmar minha presença diretamente na ficha. O servidor identifica a pessoa pelo vínculo da conta com o RH, inclusive login alternativo do Painel; nomes coincidentes não identificam pessoas.
- Criador e direção podem usar Marcar presente junto ao convidado. Correções de presença continuam disponíveis no editor existente.
- Confirmação registra presença efetiva, não um RSVP separado. Não confirma automaticamente convidados nem altera o evento da agenda.
- Ata, anexos e encaminhamentos permanecem preservados. Operação atômica com até três tentativas quando outra pessoa atualiza a reunião; mudança concorrente da mesma presença pede atualização da tela. Repetir confirmação já gravada não duplica o histórico.
- Conta sem vínculo recebe orientação explícita. Falha ao conferir identidade impede confirmação própria, sem bloquear consulta da reunião. Reunião cancelada não aceita confirmação.

## Aviso no topo

Mostra o próximo encontro da pessoa conectada e permite consultar os demais nos próximos sete dias. Informa título, horário, local e pendência de presença. Aparece em todas as áreas do Painel para quem já tem acesso a Reuniões, respeitando o vínculo da conta com o RH. Reuniões canceladas ou de outra pessoa não aparecem. Depois do horário final, só permanece a pendência de presença do dia. Não envia mensagens externas nem concede permissões.

Atualização a cada minuto enquanto a página está visível, ao retornar e após salvar um encontro ou confirmar presença. Consultas anteriores são canceladas; não há cache compartilhado entre contas. Consulta do servidor filtrada por data e participante, com projeção mínima.

## Validação

29 testes de reuniões/RH/PDF/servidor aprovados. Casos incluem identidade, alias, leitor, criador/direção, revogação, concorrência, cancelamento, convidado removido, histórico, inclusão no PDF apenas dos presentes e aviso restrito à pessoa e ao período. Os primeiros testes de confirmação falharam antes da implementação e passaram depois.

Regressões: 1.611 casos; os dois casos que abrem servidor local foram impedidos pelo sandbox e passaram ao executar o arquivo de sete casos fora dele. Cálculo/fabricação: 1.304 aprovados. Acesso: sete aprovados. Quinze verificadores aprovados, incluindo a lista de módulos contra a versão atual de equipe-auth. Build oficial aprovado. Lint: zero erros, aviso preexistente em Agenda.jsx.

Navegador: aviso no início e na ficha, abertura da reunião pelo aviso, confirmação de convidado sem edição, lista de 0/2 para 1/2 e aviso atualizado, PDF habilitado, marcação pelo responsável. Celular 390 px sem transbordamento após ajuste do botão, temas claro/escuro e console sem erros. Nenhuma presença real alterada. Conteúdo do PDF validado nos testes; evento do download não foi capturado pela automação.

## Publicação autorizada

O dono autorizou a publicação e solicitou o aviso no topo. Servidor painel-reunioes v74 implantado primeiro e os quatro arquivos foram relidos e conferidos integralmente. Interface em preparação para GitHub Pages. Não há migração SQL ou concessão automática de permissões. ACM preservado no clone anterior. Prévia 4312 usa dados fictícios.

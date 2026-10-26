# Reuniões: fluxo simples

Pedido: publicar uma interface simples, moderna e eficiente, preservando a programação recorrente, o calendário e as atas já liberados.

- Título, data, horários, responsável e setor vêm primeiro. Pauta, local, tipo e situação continuam editáveis em uma seção recolhível com resumo do que está preenchido.
- Participantes são encontrados por nome, ID oficial, ficha RH ou setor. O diretório completo só aparece por escolha explícita. Selecionados viram chips removíveis e saem dos resultados da busca.
- Presença e convidados ficam em detalhes. Um convidado sem nome mantém o campo obrigatório aberto. Adicionar ou remover uma pessoa devolve o foco à busca para continuar pelo teclado.
- A série mostra quantidade, período e horário. Todas as datas continuam disponíveis para conferência antes da confirmação.
- Estilos isolados de Reuniões, com celular e modo escuro preservados. Nenhuma alteração de servidor, permissões ou esquema de dados.

## Verificação local

65 testes pertinentes aprovados, incluindo persistência, conflitos, autorização, recorrência e os novos fluxos de seleção. Build com base oficial aprovado; 72 classes conferidas. ESLint sem erros, com aviso preexistente em Agenda.

Navegador em prévia fictícia: reunião única com pauta/local e participante por ID salva e relida após recarga; série de três encontros e convidado externo salva e relida. Validação obrigatória de convidado visível, foco por teclado corrigido e conferido. Celular de 390 px, modo escuro, sem transbordamento horizontal do formulário. Nenhum erro de console observado. Revisão independente sem bloqueadores.

Nenhum registro, convite ou permissão produtiva foi alterado.

## Publicação conferida

Interface `1da6a60`, workflow Pages `40372734905` concluído com sucesso em 26/10/2026, incluindo regressões, cálculos, acessos, lint, verificadores e build. Nove arquivos públicos comparados integralmente com o build local. Formulário autenticado do site oficial recarregado: campos essenciais, opções recolhíveis, programação e catálogo RH disponíveis; nenhum erro de console observado. Servidor v93 mantido sem alteração. Evidências visuais privadas fora do Git.

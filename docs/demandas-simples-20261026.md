# Demandas: fluxo simples

Versão aprovada pelo dono após revisão da prévia local. Publicação autorizada em 26/10/2026.

- Fila com quatro atalhos principais, busca e filtros complementares recolhidos. Os cartões mostram situação, responsável e próximo prazo; o atraso não substitui a situação real. Concluídas e canceladas preservam o histórico sem alertas operacionais antigos.
- Cadastro com os campos essenciais, seleção de pessoas por nome, ID oficial, ficha ou setor e chips de participantes. O vínculo continua sendo o ID do RH. Retirar alguém responsável exige transferir a responsabilidade antes.
- Etapas, análise, objetivo, histórico e indicadores aparecem sob demanda. Campos obrigatórios de etapas ficam visíveis quando precisam ser completados. Nenhuma data ausente de registro antigo é inventada.
- Ficha com próxima etapa disponível e alertas calculados. Consultorias mantém seu fluxo e permissões. Arquivos, ações, etapas e vínculos existentes são preservados.
- Corrigida a captura imediata dos quatro campos de data no formulário de andamento: o evento de entrada atualiza o estado antes do salvamento, sem depender de sair do campo.

## Verificação

99 testes pertinentes aprovados, incluindo filas, identidade, datas, integridade, conflitos, permissões, Consultorias e integração com Reuniões. A regressão de datas falhou antes da correção e passou depois.

Na prévia fictícia: cadastro por ID, validação de obrigatórios, filtro preservado ao voltar, edição, atualização de etapa e persistência após atualizar a página. Layout conferido em computador e celular de 390 px, incluindo tema escuro, sem rolagem horizontal. Nenhum erro de console observado. Revisão independente sem bloqueadores.

Testes e dados da prévia são fictícios. Nenhum registro, convite ou permissão produtiva foi alterado. Não há alteração de servidor ou esquema nesta entrega.

Verificações de liberação: 1.846 testes raiz e 1.465 testes de cálculos/acessos aprovados. Lint sem erros, somente aviso anterior em Agenda.jsx. Build oficial e 15 verificadores aprovados; 72 classes de cor presentes. A comparação entre sistemas utilizou equipe-auth da main pública da Central do Léo em `8178bad`, pois a cópia local padrão estava desatualizada. Nenhuma regra de acesso foi modificada.

## Publicação conferida

Interface `ea6820c`, GitHub Pages `40393333493` com build e deploy concluídos com sucesso em 26/10/2026. Nove arquivos públicos comparados integralmente com o build aprovado. Site oficial autenticado recarregado: fila compacta, novo cadastro, busca RH e detalhes recolhidos disponíveis; nenhum erro de console observado. Formulário fechado sem salvar. Servidor, registros e permissões reais preservados. Evidência visual privada fora do Git.

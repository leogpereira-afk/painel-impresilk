# Demandas e Consultorias no Calendário

Proposta aprovada por Léo em 08/10/2026, ampliada para consultorias com colaboração por link.

Duas abas do Calendário usam o mesmo fluxo de processos: Demandas e Consultorias. Cada registro tem ID estável, título, setor, prioridade, situação, objetivo, análise, solução, responsável por ID RH, envolvidos por ID RH, etapas identificadas com responsáveis, dependências, prazos, arquivos privados e histórico. Consultoria acrescenta empresa/consultor e especialidade. Não altera Compromissos, reuniões, RH nem PCP.

Fluxo: nova, análise, planejada, execução, validação, concluída ou cancelada. Bloqueios ficam registrados por etapa. Encerrar exige etapas concluídas; dependências não podem formar ciclos. Prazos são datas civis, calendário em America/Sao_Paulo. Calendário deriva os eventos das mesmas etapas, sem criar cópias que fiquem desatualizadas; canceladas não aparecem, concluídas mantêm identificação histórica.

Apenas dados mínimos de pessoas: ID, nome, área, cargo. Identidade interna é resolvida no servidor pela conta de acesso e seu colaborador_id; nunca por coincidência de nome. Criador, direção e responsável administram; envolvidos leem e contribuem. A permissão demandas habilita as duas abas, mas não libera registros de terceiros.

Convite: criado explicitamente pelo gestor, um por pessoa, ID próprio e RH ID quando interno; segredo aleatório de 256 bits com somente SHA-256 persistido, prazo até 30 dias e revogação. O link dá acesso somente à ficha compartilhada (objetivo, solução, etapas, materiais compartilhados e registros externos), sem diretório RH, análise interna ou histórico administrativo. Etapas externas vão no máximo para validação; gestor aprova conclusão. O link é uma credencial transferível, não prova de identidade pessoal; a interface explica isso. Não enviar convites automaticamente.

Arquivos: mesmos tipos de Reuniões, 5 MB por arquivo, 20 arquivos por processo, bucket privado existente. Material só é visível no portal se compartilhado explicitamente ou enviado ali. Download autorizado por ficha e arquivo, URL temporária; upload com falha de gravação é revertido. Versão esperada e CAS evitam perda por concorrência. Cancelamento arquiva logicamente; não existe exclusão definitiva.

Verificação: regras puras de IDs, datas, dependências e estados; servidor sem sessão/sem permissão/terceiros/convite inválido, vencido e revogado; conflitos; isolamento de anexos; ciclo de criação, etapa, calendário, contribuição e validação; build/lint/testes e prévia em tela larga e celular com dados fictícios. Publicação só será considerada concluída após backend e frontend verificados.

# Consultorias: edição compartilhada e acessos

## Escopo aprovado

Consultores com nível colaborador ou administrador podem editar o conteúdo de todas as ações e registros compartilhados da própria consultoria. Leitores não escrevem. Informações internas continuam restritas. Master/gestão cria acessos e pode escolher ausência de vencimento. Prévia aprovada e publicação autorizada em 27/10/2026.

## Implementação

- Editor de título, tipo, data, texto, resultado, próximo passo e vínculo à etapa.
- Autoria, identificador, criação, implantação e histórico original preservados. Cada alteração contém antes, depois, editor e momento. Registro sem mudança não ganha revisão.
- Registros legados sem tipo continuam como Andamento. Etapas anteriormente vinculadas mantêm marca de atividade histórica.
- Versão capturada ao abrir o editor; gravação comparada no servidor. Em concorrência, rascunho permanece na tela, com comparação e escolha explícita entre alterações conflitantes.
- Lista compacta, busca, filtros recolhíveis, próximo passo e edição visíveis; histórico antes/depois nos detalhes. Demandas mantém seu formulário e filtro anteriores.
- Opção explícita sem vencimento: `semValidade: true` e `expiraEm: null`. Acessos existentes não são convertidos automaticamente. Datas legadas ausentes ou inválidas não concedem acesso.
- Revogação, substituição de segredo e limites do administrador emissor preservados. Tornar o administrador permanente não amplia nem reativa seus convites antigos.
- Fragmento do convite permanece no endereço para permitir recarga, sem cópia adicional em localStorage ou cookies. O portal continua restrito à ficha do convite.

## Evidência local

- 1.907 testes aprovados: `node --test tests/*.test.mjs src/lib/calc/processos*.test.mjs src/lib/calc/consultoria-link.test.mjs`.
- Build de produção e build de revisão aprovados.
- ESLint: zero erros; um aviso preexistente em Agenda.jsx sobre referência no cleanup de efeito.
- Git diff-check sem erros. Revisão independente de segurança, compatibilidade e UI sem achados bloqueantes após correções.
- Navegador: colaborador editou registro de outro autor; salvou, recarregou e consultou uma revisão antes/depois sem duplicar o histórico.
- Navegador: leitor sem edição/cadastro; registro interno ausente no portal.
- Navegador: master criou convite fictício permanente; abriu após recarga; revogação bloqueou o link.
- Visual: computador, tema escuro e janela de conteúdo com largura de 390 px. Sem erros no console; apenas avisos de atualização futura do React Router.

Todos os dados usados são fictícios. A simulação usa sessionStorage por aba; não comprova sincronização produtiva entre dispositivos. Proteções reais do endpoint foram testadas com serviço/banco substitutos locais. Não houve migração, emissão de convite real, deploy, push ou alteração do banco produtivo.

## Publicação posterior

Após autorização, revisar a main atual, integrar somente os arquivos desta tarefa e publicar a função `painel-processos` antes da tela. Conferir então o build servido e realizar validação controlada em produção. O formato usa o armazenamento JSON e a gravação comparada existentes; não exige migração de esquema. Preservar dados atuais e não converter os acessos finitos em permanentes sem escolha explícita da gestão.

## Publicação autorizada

Em 27/10/2026, servidor 9db2370 publicado seletivamente como painel-processos v94 ACTIVE antes da interface. Os quatro arquivos foram relidos iguais ao pacote aprovado; pedido sem sessão retorna 401. Verificação fresca: 1.907 testes gerais/processos, 1.470 cálculos/acessos, 14 verificadores, build oficial e conferência de classes aprovados. Interface e validação produtiva em andamento.

## Conferência da publicação

- Interface `4b84356`, Pages `40595231658`, build e deploy concluídos com sucesso.
- Nove arquivos públicos iguais byte a byte ao build oficial, incluindo editor, portal externo, serviços e CSS.
- Sessão oficial autenticada recarregada: lista compacta, edição, autoria e opções de validade disponíveis. Formulário de validade foi conferido e cancelado sem alterar acessos reais.
- Integridade das fichas existentes comparada antes/depois sem diferença. Evidência privada fora do repositório.
- Testes locais cobrem gravação, histórico, recarga, permissões, links permanentes e revogação; não equivalem à prova final de escrita em produção.
- A revisão automática bloqueou a execução do teste produtivo por criar acessos permanentes, exigindo autorização específica. Pergunta enviada ao dono. A ficha fictícia de preparação foi encerrada e todos os seus acessos revogados; nada foi apagado.
- Pendente: após autorização, criar somente acessos isolados para dados fictícios, validar edição/recarga/histórico no servidor e navegador, e revogar ao concluir. Nenhuma ação ou convite real foi alterado.

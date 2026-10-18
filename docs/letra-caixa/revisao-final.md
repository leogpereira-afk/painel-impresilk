# Revisão final independente — 17/10/2026

Escopo: quatro correções de revisao-integracao.md e leitura adicional de LetraCaixa.jsx, project.mjs e storage.mjs. Somente este relatório foi escrito. Não revisado o Field decimal em edição pelo integrador; testes de navegador pertencem à integração principal.

## Correções verificadas

Reproduções Node confirmaram:

- Exportação com mesmo ID/revisão e parâmetros alterados agora é bloqueada pela assinatura.
- Relatório mostra consumo teórico 0,1 L conhecido e inclui erro técnico de tempo inválido.
- Nesting separa área física e envelope, com bases nomeadas corretamente: O do caso anterior tem área física 15.908,875668846686 mm², igual ao motor.
- Retalho compatível resulta em unit retalho, preço null sem cadastro específico, complete=false e purchasedM2=0; área consumida fica separada.

## Achados restantes

1. **P2 — Importação válida de galvanizada cega pode derrubar toda a página.** `src/pages/LetraCaixa.jsx:62` e `:63` (materialEditor/buildPanel). A família galvanized-blind permite `materials.front=null`, pois usa o material da lateral também na face. `validateStudioProject` aceita esse projeto (reprodução Node). A página constrói buildPanel em todo render, percorre front/side para ambas as famílias galvanizadas e chama materialEditor(null); acesso `m.material` lança TypeError. Isso ocorre mesmo estando na etapa Texto. Não renderizar o editor de frente acrílica para a versão cega, ou fornecer editor coerente com o material usado pelo motor. Proteger também contra materiais opcionais ausentes de outros formatos válidos.

2. **P2 — Repetir exportação de caderno na mesma revisão falha.** `src/pages/LetraCaixa.jsx:52` (exportDoc), `src/lib/letras/documents.mjs:18`, `src/lib/fabrication/storage.mjs:15` (putDocument). O nome é sempre letra-caixa-R{revision}-caderno.html; o conteúdo inclui horário de geração novo. Após primeira exportação, clicar novamente gera conteúdo diferente com o mesmo nome/revisão; storage rejeita “Documento imutável; use nova revisão ou nome” e emit não executa download. Reprodução executada com backend em memória usando o storage real e duas chamadas ao gerador separadas por 5 ms. Reutilizar o documento arquivado ou produzir nome único para uma nova emissão, mantendo revisão congelada.

3. **P2 — Falha de arquivamento é anunciada como sucesso pelo planejador.** `src/pages/LetraCaixa.jsx:51` (emit) e integração com InstallationPlanner, confrontado com `src/components/acm/InstallationPlanner.jsx:157-162`. emit captura erro de putDocument e termina resolvida, sem devolver falha. InstallationPlanner faz await onExport e anuncia “Ficha arquivada nesta revisão” quando essa Promise resolve. Portanto quota, indisponibilidade ou revisão imutável podem produzir aviso de sucesso no planejador apesar do erro global. O fluxo é determinístico por leitura: fazer o callback propagar erro, ou retornar um resultado explícito e conferir antes da mensagem de sucesso. Não alterar arquivo/estado remoto.

## Observações sem novo bloqueio

O histórico local exportado por JSON é apenas projeto atual; documentação deve manter essa distinção. A leitura não identificou corrupção adicional nas transações de storage. Não executado IndexedDB real nem simulação de quota neste passe. A lista de documentos é atualizada ao carregar e depois de arquivar/emitir; mudanças de identidade do projeto devem também atualizar essa lista para evitar apresentar arquivos de outro projeto, mas não foi classificado como bloqueio separado sem ensaio de navegação.

## Rechecagem após correções — encerramento

Os três P2 acima estão **corrigidos no código atual**, conforme leitura focada de LetraCaixa.jsx:

- Linha 62 protege material ausente com value||{}; linha 63 apresenta somente o editor side na família cega, que representa face e laterais. O caminho materialEditor(null) do achado não existe mais.
- Linha 52 gera nome de emissão com Date.now() e aguarda emit em todas as exportações. O integrador também relatou ensaio no navegador de dois cadernos da mesma R19, nomes diferentes e ambos arquivados; esse ensaio não foi repetido por este revisor.
- Linha 51 relança a falha de emit. O callback de instalação retorna essa Promise; InstallationPlanner captura a rejeição antes de anunciar sucesso. exportDoc possui seu próprio catch para apresentar falhas.

Nenhum novo bloqueio concreto foi identificado nesta rechecagem restrita. Os achados acima ficam preservados como histórico da revisão, não como pendências atuais. Não houve edição de código, commit ou publicação pelo revisor.

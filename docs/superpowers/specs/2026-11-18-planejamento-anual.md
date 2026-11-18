# Planejamento anual no Calendário da Empresa

Escopo aprovado em 18/11/2026: botão Planejamento anual dentro do Calendário → Empresa, com ficha única de ação, projeção no calendário, múltiplos responsáveis pelo RH, valores, etapas, anexos, comentários e histórico. Prévia antes de publicação. Nenhum registro real deve ser gravado nesta etapa.

## Contrato compartilhado

Coleção `planejamento_anual` em `painel_registros`, usando gravação transacional com comparação do registro anterior. Arquivos privados em `painel-arquivos`, prefixo `planejamento/<id>/`. A consulta `painel-planejamento` usa autenticação/revogação do Painel; permissão `calendario-empresa`. Gestão por master; demais leitores autorizados consultam, responsáveis atualizam andamento autorizado. Nenhum acesso automático ao RH.

Registro: `{id,versao,ano,mes,titulo,categoria,descricao,observacoes,setores,periodo,dataInicio,dataFim,preparacaoInicio,implantarAte,preparacaoRegra,responsaveis,previstoCentavos,realizadoCentavos,situacao,etapas,anexos,comentarios,historico,origem,criadoEm,criadoPor,atualizadoEm}`. Datas são ISO date-only ou string vazia; `mes` inteiro 1..12; `ano` inteiro; `periodo` = `data|mes|a_definir`; `categoria` = `colaboradores|saude|comercial|outro`; `situacao` = `aberta|preparacao|execucao|concluida|cancelada`. Valores inteiros em centavos ou null (ausente nunca equivale a zero). Responsável `{rhId,idPessoa,nome,setor}`; idPessoa oficial de seis dígitos validado no diretório, identificação pela ficha preservada. Etapa `{id,titulo,prazo,responsaveis,situacao}` com situação `aberta|execucao|concluida`. Origem importada guarda chave estável, aba, linha e conteúdo original. Campo ausente ou incompatível não é inventado.

API POST `painel-planejamento`: `listar {ano}` → `{ok,itens,ator:{gestor,rhId,usuario,nome}}`; `pessoas` → `{ok,pessoas:[{rhId,idPessoa,nome,setor,disponivel}]}`; `salvar {item}` → `{ok,item}`; `agenda {mes:'YYYY-MM'}` → `{ok,eventos}`; `comentar {id,versao,texto}`; `anexar {id,versao,nome,mime,base64,descricao,etapaId?,substituiId?}`; `arquivo {id,arquivoId}` → `{ok,url}`; `removerAnexo {id,versao,arquivoId}` (remoção lógica); `importar {itens:[{item,versao}],loteId}` → `{ok,itens}` com transação atômica, reimportação preservando execução e comparando versão. Erros `{erro}` e status HTTP; conflito 409.

Exports domínio `supabase/functions/_shared/planejamento.mjs`: `ErroPlanejamento`, `SITUACOES`, `CATEGORIAS`, `validarAcao(entrada,antes,ator,pessoas,agora?)`, `projetarAgenda(itens,mes)`, `resumoAcoes(itens,hoje?)`, `podeEditarAcao(item,ator)`, `registrarComentario(antes,texto,ator,agora?)`. `validarAcao` valida e incrementa versão/histórico e é reutilizada na prévia. Ator `{gestor,rhId,usuario,nome}`. Eventos `{id,acaoId,data,dataFim?,periodo?,tipo:'Planejamento',origem:'planejamento',titulo,descricao,cor,href}`; eventos de mês inteiro têm uma projeção com intervalo, não 31 registros. Ações indefinidas não criam evento de data presumida.

## Requisitos funcionais e limites

- Fonte da importação: somente Plano de ações, 16 registros no arquivo fornecido. Resumos e feriados separados. XLSX lido no navegador; nada privado embutido no bundle. Prévia usa dados fictícios.
- Botão preserva o calendário atual. Planejamento abre na mesma rota com query `planejamento=1&ano=2027`; ação via `acao=<uuid>`. Calendário abre a mesma ficha. Sem duplicação em Demandas.
- Filtros mês, categoria, responsável, situação, pendências e Minhas ações. Indicadores por ação, nunca por responsável ou projeção.
- Formulário permite rascunho; data indefinida, custo ausente e custo zero distintos. Etapas e marcos independentes, regra relativa somente calculada com referência conhecida e revisão dos efeitos.
- Anexos privados, 20 ativos por ação e 5 MiB por arquivo, versões anteriores preservadas. Reaproveitar validação de arquivos já existente. Comentários e alterações preservam autor, data e valores anteriores.
- Remoção de pessoas inativas não destrói história; novo vínculo somente com diretório válido. Falha de RH impede novos vínculos e aparece como erro.
- Persistência de produção pelo servidor; prévia isolada persistente no navegador, inclusive anexos, claramente identificada como simulação. Concorrência protegida, falhas não descartam formulário.
- Sem publicar, aplicar migrations, consultar dados RH privados ou importar registros reais nesta etapa.

## Verificação

Testes de domínio: múltiplos IDs, orçamento nulo/zero, 3 responsáveis contam uma ação, reimportação, marcos e mês inteiro, datas BR/ISO, concorrência e controle de versão, permissões de gestão/responsável/leitura, arquivos/histórico. Testes da importação com 16 ações sintéticas. Testes SQL com PGlite. Build, lint focal, regressões pertinentes. Conferência desktop/celular 390 px, criar/salvar/recarregar, responsáveis, custo, anexar/baixar, editar e abrir no calendário. Sem promessa de validação em produção antes do deploy autorizado.

# Correção do vínculo do titular ao RH

O cadastro de titular rejeitava identificadores de ficha do RH que não eram UUIDs, antes de consultar o catálogo autorizado. O ID da ficha é diferente do idPessoa de seis dígitos exibido na tela.

Correção: retirar a exigência exclusiva de UUID neste vínculo e reutilizar validarVinculoPessoa, que verifica a ficha no catálogo RH e sua disponibilidade. IDs de titular/documento permanecem com suas validações originais. Sem alterações de registros, permissões, interface ou migrations.

Teste de regressão com dados fictícios: falha antes (422 em vez de 200) e passa após a correção. Cobertura inclui ficha não UUID, nome oficial vindo do RH, rejeição de ID inexistente, pessoa indisponível e número de empresa usado indevidamente como ID da ficha. Suíte relacionada: 75 testes, zero falhas. Diff e sintaxe verificados.

Publicação necessária: função painel-ativos. Não publicada; aguardando autorização específica. Não testar criando titular real automaticamente.

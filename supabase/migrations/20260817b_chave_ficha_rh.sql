-- A CHAVE ENTRE A CONTA E A FICHA DO RH.
--
-- Decisao do Leonardo em 17/08/2026: a ligacao e o CPF, e nao o nome. O nome
-- quebrava em silencio -- corrigir um acento ou casar e mudar de sobrenome
-- desligava a conta da ficha, e a pessoa continuava entrando enquanto o
-- desligamento deixava de alcanca-la.
--
-- `cpf` e a CHAVE. `colaborador_id` e a REDE: se um dia alguem corrigir um CPF
-- digitado errado, a conta nao fica orfa -- o id da ficha ainda aponta, e a
-- tela consegue mostrar a divergencia em vez de perder a pessoa. Guardar os
-- dois nao contraria a decisao: um decide, o outro conserta.
--
-- `colaborador` (o nome) fica, e passa a ser SO EXIBICAO.
alter table public.acesso_conta add column if not exists cpf text;
alter table public.acesso_conta add column if not exists colaborador_id text;

comment on column public.acesso_conta.cpf is
  'CHAVE de ligacao com a ficha do RH (so digitos). Dado pessoal: mascarar na tela.';
comment on column public.acesso_conta.colaborador_id is
  'Rede de seguranca: id da ficha. Serve para reencontrar a pessoa se o CPF for corrigido.';
comment on column public.acesso_conta.colaborador is
  'Nome do colaborador, SO PARA EXIBIR. Nao e mais chave de nada.';

create unique index if not exists acesso_conta_cpf_unico
  on public.acesso_conta (cpf) where cpf is not null and cpf <> '';

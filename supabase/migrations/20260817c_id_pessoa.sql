-- O ID DA PESSOA NA CASA: os 6 primeiros digitos do CPF.
--
-- Decisao do Leonardo em 17/08/2026, e ela resolve duas coisas de uma vez.
-- O nome quebrava em silencio (o `perfis` guarda "leonardo goncalves" sem
-- cedilha e a Central guardava "Leonardo Gonçalves" com -- 2 das 6 linhas do RH
-- JA estavam desligadas por causa disso). E o CPF inteiro como chave espalharia
-- documento por oito sistemas, tela de acessos e copia diaria.
--
-- Seis digitos foram conferidos contra as 88 fichas vivas: todos unicos. Quatro
-- ja bastariam hoje; seis da folga para crescer.
--
-- O DIA EM QUE DOIS COLIDIREM: o indice unico abaixo faz o cadastro FALHAR na
-- cara de quem esta cadastrando, em vez de juntar duas pessoas numa so. Colisao
-- silenciosa aqui seria pior que qualquer defeito que ja consertamos: duas
-- pessoas com o mesmo acesso, a mesma folha e o mesmo historico. Falhando alto,
-- a saida e simples -- aquela pessoa leva 7 digitos.
--
-- O CPF INTEIRO NAO FICA AQUI. Ele mora na ficha do RH, que e onde ja estava e
-- onde precisa estar para folha e eSocial. Aqui fica so o pedaco que identifica.
alter table public.acesso_conta add column if not exists id_pessoa text;

comment on column public.acesso_conta.id_pessoa is
  'ID da pessoa na casa: 6 primeiros digitos do CPF. Chave de ligacao com a ficha do RH.';

update public.acesso_conta set id_pessoa = left(cpf, 6) where coalesce(cpf,'') <> '';

alter table public.acesso_conta drop column if exists cpf;

create unique index if not exists acesso_conta_id_pessoa_unico
  on public.acesso_conta (id_pessoa) where id_pessoa is not null and id_pessoa <> '';

alter table public.acesso_conta drop constraint if exists acesso_conta_id_pessoa_formato;
alter table public.acesso_conta add constraint acesso_conta_id_pessoa_formato
  check (id_pessoa is null or id_pessoa ~ '^[0-9]{6,11}$');

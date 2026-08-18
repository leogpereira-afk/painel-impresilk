-- A CONTA DO TERCEIRIZADO PASSA A DERIVAR DO CONTRATO, EM VEZ DE COPIA-LO.
--
-- Ordem do Leonardo em 18/08/2026: "tem que ser apenas um". Ate aqui, cadastrar
-- um freelancer pedia o contrato no RH E a conta na Central, com a DATA DIGITADA
-- NOS DOIS. Duas datas para o mesmo fato e o comeco de toda divergencia que este
-- dia inteiro passou consertando: uma delas envelhece, e ninguem descobre qual.
--
-- Agora `acesso_conta.freelancer_id` aponta para o contrato, e a data de fim e
-- LIDA DE LA na hora de decidir. Renovou o contrato no RH? A porta reabre
-- sozinha. Encerrou? Fecha. Sem ninguem tocar na Central.
alter table public.acesso_conta add column if not exists freelancer_id text;

comment on column public.acesso_conta.freelancer_id is
  'Contrato de freelancer (registros/freelancers) de onde sai a data de validade. Quando preenchido, valido_ate e IGNORADO -- a data mora no contrato, num lugar so.';

/* O PRAZO CONTINUA OBRIGATORIO -- so mudou de onde ele pode vir. Ou a conta
   aponta para um contrato (e a data e de la), ou traz a propria data e
   responsavel. O que segue proibido e terceirizado SEM prazo nenhum: e assim
   que acesso esquecido vira porta aberta. */
alter table public.acesso_conta drop constraint if exists acesso_conta_terceirizado_prazo;
alter table public.acesso_conta add constraint acesso_conta_terceirizado_prazo
  check (
    tipo <> 'terceirizado'
    or coalesce(freelancer_id, '') <> ''
    or (valido_ate is not null and coalesce(responsavel, '') <> '')
  );

/* A DATA QUE VALE PARA ESTA CONTA, venha de onde vier.
   Uma funcao so, para a regra de revogacao e a tela de pendencias nao lerem o
   contrato de dois jeitos diferentes -- que e exatamente como as copias comecam. */
create or replace function public.acesso_valido_ate(p_conta public.acesso_conta)
returns date
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when coalesce(p_conta.freelancer_id, '') <> '' then (
      select nullif(r.registro->>'contratoFim', '')::date
        from registros r
       where r.colecao = 'freelancers' and r.id = p_conta.freelancer_id and not r.apagado
       limit 1)
    else p_conta.valido_ate
  end;
$fn$;

/* E o contrato ENCERRADO fecha na hora, sem esperar a data: encerrar e decisao
   de alguem, e decisao tomada nao espera o relogio. */
create or replace function public.acesso_contrato_encerrado(p_conta public.acesso_conta)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select r.registro->>'situacao' = 'encerrado'
       from registros r
      where r.colecao = 'freelancers' and r.id = p_conta.freelancer_id and not r.apagado
      limit 1),
    false);
$fn$;

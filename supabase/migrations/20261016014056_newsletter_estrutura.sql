-- Somente estrutura nova. Não transforma canais ou publicações existentes.
create table public.painel_newsletter (
 id uuid primary key,
 tipo text not null check (tipo in ('contato','lista','edicao','remetente')),
 dados jsonb not null check (jsonb_typeof(dados)='object'),
 versao integer not null default 1,
 atualizado_em timestamptz not null default now(),
 atualizado_por text not null,
 check (tipo <> 'remetente' or id='00000000-0000-4000-8000-000000000001'::uuid)
);
create unique index newsletter_email_unico on public.painel_newsletter (lower(dados->>'email')) where tipo='contato';
create index newsletter_tipo_id on public.painel_newsletter(tipo,id);
create table public.painel_newsletter_revisoes (
 registro_id uuid not null references public.painel_newsletter(id),
 versao integer not null,
 dados jsonb not null,
 atualizado_em timestamptz not null,
 atualizado_por text not null,
 primary key(registro_id,versao)
);
alter table public.painel_newsletter enable row level security;
alter table public.painel_newsletter_revisoes enable row level security;
revoke all on public.painel_newsletter,public.painel_newsletter_revisoes from public,anon,authenticated;
grant select,insert,update on public.painel_newsletter to service_role;
grant select,insert on public.painel_newsletter_revisoes to service_role;

create function public.painel_newsletter_salvar(p_id uuid,p_tipo text,p_dados jsonb,p_versao integer,p_quem text)
returns public.painel_newsletter language plpgsql security invoker set search_path=public as $$
declare atual public.painel_newsletter; resultado public.painel_newsletter; lista text;
begin
 if p_quem is null or length(p_quem)=0 then raise exception 'Autor obrigatório'; end if;
 -- Serializa gravações do mesmo ID, inclusive novas; índice impede e-mails duplicados.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into atual from public.painel_newsletter where id=p_id for update;
 if found then
  if atual.tipo<>p_tipo or p_versao is distinct from atual.versao then raise exception 'NEWSLETTER_CONFLITO'; end if;
  if p_tipo='contato' and atual.dados->>'situacao' in ('descadastrado','bloqueado') and p_dados->>'situacao' not in ('descadastrado','bloqueado') then raise exception 'NEWSLETTER_SUPRIMIDO'; end if;
  if p_tipo='contato' and atual.dados->>'email' is distinct from p_dados->>'email' then raise exception 'NEWSLETTER_EMAIL_IMUTAVEL'; end if;
 else
  if p_versao is not null then raise exception 'NEWSLETTER_CONFLITO'; end if;
 end if;
 if p_tipo in ('contato','edicao') then
  for lista in select jsonb_array_elements_text(coalesce(p_dados->'listas','[]')) loop
   if not exists(select 1 from public.painel_newsletter where id=lista::uuid and tipo='lista') then raise exception 'NEWSLETTER_LISTA_INVALIDA'; end if;
  end loop;
 end if;
 if atual.id is not null then
  update public.painel_newsletter set dados=p_dados,versao=versao+1,atualizado_em=now(),atualizado_por=p_quem where id=p_id returning * into resultado;
 else
  insert into public.painel_newsletter(id,tipo,dados,atualizado_por) values(p_id,p_tipo,p_dados,p_quem) returning * into resultado;
 end if;
 insert into public.painel_newsletter_revisoes values(resultado.id,resultado.versao,resultado.dados,resultado.atualizado_em,resultado.atualizado_por);
 return resultado;
end $$;
revoke all on function public.painel_newsletter_salvar(uuid,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.painel_newsletter_salvar(uuid,text,jsonb,integer,text) to service_role;

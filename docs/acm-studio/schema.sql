-- Prepared SQL, tested locally with PostgreSQL/PGlite. NOT applied to any remote database.
-- Generate the migration with `supabase migration new acm_studio` before deployment.
begin;

create table if not exists public.painel_acm_projetos (
  dono text not null check (length(dono) between 1 and 200),
  id text not null check (length(id) between 1 and 200),
  versao bigint not null check (versao > 0),
  projeto jsonb not null check (jsonb_typeof(projeto)='object' and octet_length(projeto::text)<=1048576),
  atualizado_em timestamptz not null default now(),
  primary key (dono,id),
  check ((projeto->>'id'=id and projeto->>'schemaVersion'='1' and projeto->>'units'='mm') is true)
);
create table if not exists public.painel_acm_revisoes (
  dono text not null,
  projeto_id text not null,
  revisao integer not null check (revisao > 0),
  id uuid not null default gen_random_uuid(),
  projeto jsonb not null check (jsonb_typeof(projeto)='object' and octet_length(projeto::text)<=1048576),
  criado_em timestamptz not null default now(),
  primary key (dono,projeto_id,revisao),
  unique (dono,id),
  foreign key (dono,projeto_id) references public.painel_acm_projetos(dono,id),
  check ((projeto->>'id'=projeto_id and (projeto->>'revision')::integer=revisao) is true)
);
create table if not exists public.painel_acm_eventos (
  dono text not null,
  projeto_id text not null,
  versao bigint not null,
  acao text not null check (acao in ('save','saveRevision')),
  criado_em timestamptz not null default now(),
  primary key (dono,projeto_id,versao),
  foreign key (dono,projeto_id) references public.painel_acm_projetos(dono,id)
);
create table if not exists public.painel_acm_ai_uso (
  id uuid primary key default gen_random_uuid(),
  dono text not null,
  modelo text not null,
  reservado_usd numeric(12,6) not null check (reservado_usd > 0),
  custo_estimado_usd numeric(12,6),
  tokens_entrada integer,
  tokens_saida integer,
  estado text not null default 'reserved' check (estado in ('reserved','complete','failed')),
  criado_em timestamptz not null default now()
);
create index if not exists painel_acm_ai_uso_dono_data on public.painel_acm_ai_uso(dono,criado_em desc);

alter table public.painel_acm_projetos enable row level security;
alter table public.painel_acm_revisoes enable row level security;
alter table public.painel_acm_eventos enable row level security;
alter table public.painel_acm_ai_uso enable row level security;
revoke all on public.painel_acm_projetos,public.painel_acm_revisoes,public.painel_acm_eventos,public.painel_acm_ai_uso from public,anon,authenticated,service_role;
grant select,insert,update on public.painel_acm_projetos,public.painel_acm_ai_uso to service_role;
grant select,insert on public.painel_acm_revisoes,public.painel_acm_eventos to service_role;
-- No public/authenticated policy: the application's JWT is checked in painel-acm.

create or replace function public.painel_acm_salvar(p_dono text,p_projeto jsonb,p_versao bigint,p_snapshot boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_id text := p_projeto->>'id';
  v_revisao integer;
  v_atual public.painel_acm_projetos;
  v_snapshot public.painel_acm_revisoes;
  v_nova_versao bigint;
  v_max_revisao integer;
begin
  if p_dono is null or length(p_dono) not between 1 and 200 or v_id is null or length(v_id) not between 1 and 200 or p_versao is null or p_versao<0
    or jsonb_typeof(p_projeto) is distinct from 'object' or octet_length(p_projeto::text)>1048576
    or p_projeto->>'schemaVersion' is distinct from '1' or p_projeto->>'units' is distinct from 'mm'
    or coalesce(p_projeto->>'revision','') !~ '^[1-9][0-9]{0,6}$'
  then raise exception using errcode='22023',message='ACM_SCHEMA'; end if;
  v_revisao := (p_projeto->>'revision')::integer;
  -- Owner lock serializes first inserts, CAS, snapshots and the owner's project-count limit.
  perform pg_advisory_xact_lock(hashtextextended('acm-projects:'||p_dono,0));
  select * into v_atual from public.painel_acm_projetos where dono=p_dono and id=v_id for update;
  if coalesce(v_atual.versao,0)<>p_versao then raise exception using errcode='40001',message='ACM_CONFLICT'; end if;
  select * into v_snapshot from public.painel_acm_revisoes where dono=p_dono and projeto_id=v_id and revisao=v_revisao;
  if found and v_snapshot.projeto is distinct from p_projeto then raise exception using errcode='40001',message='ACM_REVISION_CONFLICT'; end if;
  select max(revisao) into v_max_revisao from public.painel_acm_revisoes where dono=p_dono and projeto_id=v_id;
  if v_revisao < coalesce(v_max_revisao,0) and (v_atual.projeto is distinct from p_projeto or p_snapshot) then raise exception using errcode='40001',message='ACM_REVISION_OLD'; end if;
  if p_snapshot and v_snapshot.id is null and (select count(*) from public.painel_acm_revisoes where dono=p_dono and projeto_id=v_id)>=100
    then raise exception using errcode='54000',message='ACM_REVISION_LIMIT'; end if;
  if v_atual.versao is null and (select count(*) from public.painel_acm_projetos where dono=p_dono)>=100
    then raise exception using errcode='54000',message='ACM_PROJECT_LIMIT'; end if;
  v_nova_versao := p_versao+1;
  insert into public.painel_acm_projetos(dono,id,versao,projeto) values(p_dono,v_id,v_nova_versao,p_projeto)
  on conflict(dono,id) do update set versao=excluded.versao,projeto=excluded.projeto,atualizado_em=now()
  returning * into v_atual;
  if p_snapshot and v_snapshot.id is null then
    insert into public.painel_acm_revisoes(dono,projeto_id,revisao,projeto) values(p_dono,v_id,v_revisao,p_projeto) returning * into v_snapshot;
  end if;
  insert into public.painel_acm_eventos(dono,projeto_id,versao,acao) values(p_dono,v_id,v_nova_versao,case when p_snapshot then 'saveRevision' else 'save' end);
  return jsonb_build_object('project',v_atual.projeto,'version',v_atual.versao,'updatedAt',v_atual.atualizado_em,
    'snapshot',case when p_snapshot then jsonb_build_object('id',v_snapshot.id,'revision',v_snapshot.revisao,'createdAt',v_snapshot.criado_em) else null end);
end $$;
revoke all on function public.painel_acm_salvar(text,jsonb,bigint,boolean) from public,anon,authenticated;
grant execute on function public.painel_acm_salvar(text,jsonb,bigint,boolean) to service_role;

create or replace function public.painel_acm_ai_reservar(p_dono text,p_modelo text,p_custo numeric,p_limite_dia numeric)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid; v_minuto integer; v_dia integer; v_reservado numeric;
begin
  if p_dono is null or length(p_dono) not between 1 and 200 or p_modelo is null or length(p_modelo) not between 1 and 100
    or p_custo is null or p_custo<=0 or p_custo>0.25 or p_limite_dia is null or p_limite_dia<=0 or p_limite_dia>5
    then raise exception using errcode='22023',message='ACM_AI_CONFIG'; end if;
  perform pg_advisory_xact_lock(hashtextextended('acm-ai:'||p_dono,0));
  select count(*) filter(where criado_em>now()-interval '1 minute'),count(*),coalesce(sum(reservado_usd),0)
    into v_minuto,v_dia,v_reservado from public.painel_acm_ai_uso where dono=p_dono and criado_em>now()-interval '24 hours';
  if v_minuto>=3 or v_dia>=20 or v_reservado+p_custo>p_limite_dia then raise exception using errcode='54000',message='ACM_AI_LIMIT'; end if;
  insert into public.painel_acm_ai_uso(dono,modelo,reservado_usd) values(p_dono,p_modelo,p_custo) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.painel_acm_ai_reservar(text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.painel_acm_ai_reservar(text,text,numeric,numeric) to service_role;
commit;

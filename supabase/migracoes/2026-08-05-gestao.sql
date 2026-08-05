-- ============================================================================
-- Gestao estrategica da Impresilk — identidade, plano do ano, taticas,
-- reunioes/atas e fechamento de ciclo.
--
-- PROJETO COMPARTILHADO: o Supabase `impresilk` hospeda sete sistemas. Toda
-- tabela leva prefixo (`gestao_`), como painel_*, pcp_*, leo_*. Uma tabela
-- chamada "tatica" solta neste banco e um acidente esperando dia.
--
-- SOBRE RLS: o briefing pedia politicas por papel (diretoria/gestor/
-- colaborador). Elas NAO teriam efeito neste ecossistema: nem o Painel nem a
-- Central usam Supabase Auth, e todo acesso passa por Edge Function com a
-- service_role key -- que ignora RLS por definicao. Escrever aquelas politicas
-- daria uma falsa sensacao de seguranca.
--
-- O que se faz aqui e o oposto: RLS LIGADA e SEM politica nenhuma, ou seja,
-- porta fechada para as chaves anon/authenticated. Quem entra e so a Edge
-- Function, e e LA que o papel de cada pessoa e conferido -- mesmo desenho de
-- MODULO_DA_CHAVE e POR_DONO no painel-config.
-- ============================================================================

-- ── tipos ────────────────────────────────────────────────────────────────────
do $$ begin
  create type gestao_situacao_objetivo as enum ('no_rumo', 'atencao', 'travado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_status_plano as enum ('ativo', 'encerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_escopo as enum ('pessoal', 'empresa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_status_tatica as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_origem_tatica as enum ('manual', 'ata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_tipo_reuniao as enum ('semanal_gestao', 'mensal_resultado', 'extraordinaria');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_status_reuniao as enum ('agendada', 'realizada', 'aprovada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_status_decisao as enum ('aberta', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gestao_tipo_ciclo as enum ('trimestral', 'anual');
exception when duplicate_object then null; end $$;

-- ── empresa ──────────────────────────────────────────────────────────────────
create table if not exists gestao_empresa (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ── identidade (uma por empresa) ─────────────────────────────────────────────
create table if not exists gestao_identidade (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null unique references gestao_empresa(id) on delete cascade,
  missao         text not null default '',
  visao          text not null default '',
  visao_prazo    date,
  atualizado_por text not null default '',
  atualizado_em  timestamptz not null default now()
);

create table if not exists gestao_valor (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references gestao_empresa(id) on delete cascade,
  nome                     text not null,
  significado              text not null default '',
  comportamento_esperado   text not null default '',
  comportamento_inaceitavel text not null default '',
  ordem                    int  not null default 0
);
create index if not exists gestao_valor_empresa on gestao_valor (empresa_id, ordem);

-- ── plano do ano ─────────────────────────────────────────────────────────────
create table if not exists gestao_plano_ano (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references gestao_empresa(id) on delete cascade,
  ano               int  not null,
  tese              text not null default '',
  status            gestao_status_plano not null default 'ativo',
  -- R5: fechar ciclo NAO sobrescreve. O plano novo aponta para o anterior, e a
  -- corrente inteira continua consultavel.
  plano_anterior_id uuid references gestao_plano_ano(id) on delete set null,
  encerrado_em      timestamptz,
  criado_em         timestamptz not null default now()
);
-- Um plano ATIVO por empresa e ano. O indice parcial e o que impede dois
-- planos vivos ao mesmo tempo (dois cliques em "encerrar ciclo", duas abas).
create unique index if not exists gestao_plano_ativo_unico
  on gestao_plano_ano (empresa_id, ano) where status = 'ativo';

create table if not exists gestao_objetivo (
  id            uuid primary key default gen_random_uuid(),
  plano_ano_id  uuid not null references gestao_plano_ano(id) on delete cascade,
  titulo        text not null,
  responsavel   text not null default '',
  situacao      gestao_situacao_objetivo not null default 'no_rumo',
  ordem         int  not null default 0
);
create index if not exists gestao_objetivo_plano on gestao_objetivo (plano_ano_id, ordem);

create table if not exists gestao_indicador (
  id           uuid primary key default gen_random_uuid(),
  objetivo_id  uuid not null references gestao_objetivo(id) on delete cascade,
  nome         text not null,
  unidade      text not null default '',
  meta         numeric not null default 0,
  atual        numeric not null default 0,
  ordem        int not null default 0
);
create index if not exists gestao_indicador_objetivo on gestao_indicador (objetivo_id, ordem);

-- ── reunioes e atas ──────────────────────────────────────────────────────────
create table if not exists gestao_reuniao (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references gestao_empresa(id) on delete cascade,
  data          date not null,
  tipo          gestao_tipo_reuniao not null default 'semanal_gestao',
  participantes jsonb not null default '[]'::jsonb,
  pauta         text not null default '',
  registro      text not null default '',
  status        gestao_status_reuniao not null default 'agendada',
  aprovada_por  text,
  aprovada_em   timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists gestao_reuniao_empresa on gestao_reuniao (empresa_id, data desc);

create table if not exists gestao_decisao (
  id          uuid primary key default gen_random_uuid(),
  reuniao_id  uuid not null references gestao_reuniao(id) on delete cascade,
  texto       text not null,
  responsavel text not null default '',
  prazo       date,
  valor_id    uuid references gestao_valor(id) on delete set null,
  status      gestao_status_decisao not null default 'aberta',
  criado_em   timestamptz not null default now()
);
create index if not exists gestao_decisao_reuniao on gestao_decisao (reuniao_id);

-- ── tatica: a tabela que os DOIS lados usam ─────────────────────────────────
-- R1/R2: uma tabela so. O que separa a agenda pessoal do Leonardo do plano da
-- empresa e o `escopo`, nunca uma tabela paralela.
create table if not exists gestao_tatica (
  id           uuid primary key default gen_random_uuid(),
  escopo       gestao_escopo not null default 'empresa',
  empresa_id   uuid references gestao_empresa(id) on delete cascade,
  objetivo_id  uuid references gestao_objetivo(id) on delete set null,
  titulo       text not null,
  responsavel  text not null default '',
  prazo        date,
  status       gestao_status_tatica not null default 'aberta',
  origem       gestao_origem_tatica not null default 'manual',
  decisao_id   uuid references gestao_decisao(id) on delete set null,
  criado_por   text not null default '',
  criado_em    timestamptz not null default now(),
  concluido_em timestamptz,
  -- R3: tatica de empresa SEM objetivo e desejo solto. A trava fica no banco,
  -- nao so na tela: qualquer caminho que grave passa por aqui.
  constraint gestao_tatica_empresa_exige_vinculo check (
    escopo <> 'empresa' or (empresa_id is not null and objetivo_id is not null)
  )
);
create index if not exists gestao_tatica_escopo   on gestao_tatica (escopo, empresa_id);
create index if not exists gestao_tatica_objetivo on gestao_tatica (objetivo_id);
create index if not exists gestao_tatica_decisao  on gestao_tatica (decisao_id);

-- ── fechamento de ciclo ──────────────────────────────────────────────────────
create table if not exists gestao_ciclo_fechamento (
  id                 uuid primary key default gen_random_uuid(),
  plano_ano_id       uuid not null references gestao_plano_ano(id) on delete cascade,
  tipo               gestao_tipo_ciclo not null,
  periodo            text not null,
  -- O retrato do que estava planejado, congelado. Guardar o JSON e o que
  -- permite reler o ciclo antigo mesmo depois de objetivo e indicador mudarem.
  snapshot_planejado jsonb not null default '{}'::jsonb,
  realizado          text not null default '',
  desvios            text not null default '',
  aprendizados       text not null default '',
  criado_por         text not null default '',
  criado_em          timestamptz not null default now()
);
create index if not exists gestao_ciclo_plano on gestao_ciclo_fechamento (plano_ano_id, criado_em desc);

-- ── preferencia de interface (acordeao aberto/fechado por pessoa) ────────────
-- usuario TEXT, nao auth.uid(): a identidade aqui e a conta do painel
-- (painel_contas), nao um usuario do Supabase Auth.
create table if not exists gestao_preferencia_ui (
  usuario text not null,
  bloco   text not null,
  aberto  boolean not null default false,
  primary key (usuario, bloco)
);

-- ── porta fechada para as chaves publicas ────────────────────────────────────
-- RLS ligada e sem policy = ninguem entra com anon/authenticated. A Edge
-- Function usa a service_role, que passa por cima disso de proposito -- e e la
-- que o papel de cada conta e conferido.
alter table gestao_empresa            enable row level security;
alter table gestao_identidade         enable row level security;
alter table gestao_valor              enable row level security;
alter table gestao_plano_ano          enable row level security;
alter table gestao_objetivo           enable row level security;
alter table gestao_indicador          enable row level security;
alter table gestao_reuniao            enable row level security;
alter table gestao_decisao            enable row level security;
alter table gestao_tatica             enable row level security;
alter table gestao_ciclo_fechamento   enable row level security;
alter table gestao_preferencia_ui     enable row level security;

-- ── semente ──────────────────────────────────────────────────────────────────
insert into gestao_empresa (nome) values ('Impresilk')
  on conflict (nome) do nothing;

insert into gestao_identidade (empresa_id)
  select id from gestao_empresa where nome = 'Impresilk'
  on conflict (empresa_id) do nothing;

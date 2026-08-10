-- ============================================================================
-- Acesso unico da Impresilk — uma pessoa, uma conta, papel por sistema.
--
-- HOJE sao 33 linhas de conta para 19 usuarios, em DUAS tabelas (equipe_contas,
-- com uma linha por pessoa POR SISTEMA, e painel_contas) mais 4 usuarios no
-- Supabase Auth do RH. Sete pessoas mantem duas ou tres senhas para a mesma
-- empresa.
--
-- ESTAS TABELAS SAO UMA VERDADE PARALELA ATE A VIRADA. Nada aqui desliga o que
-- existe: equipe_contas e painel_contas continuam funcionando e continuam sendo
-- quem manda nos logins atuais. A troca acontece sistema a sistema, e so quando
-- cada um estiver lendo daqui e provado no ar. Migracao que derruba tudo de uma
-- vez nao tem como voltar atras.
--
-- RLS ligada e SEM policy: porta fechada para anon/authenticated. Quem entra e
-- a Edge Function com a service_role, e e la que o papel e conferido -- mesmo
-- desenho do resto da casa.
-- ============================================================================

do $$ begin
  create type acesso_tipo_conta as enum ('pessoa', 'funcao');
exception when duplicate_object then null; end $$;

-- ── a conta ─────────────────────────────────────────────────────────────────
create table if not exists acesso_conta (
  id            uuid primary key default gen_random_uuid(),
  usuario       text not null unique,
  nome          text not null default '',
  -- "pessoa" e gente; "funcao" e porta compartilhada (o `equipe` do DRE, o
  -- `montagem` do PCP). A diferenca importa porque em porta compartilhada o
  -- historico nao diz QUEM fez -- e quem classifica cada uma e a direcao, na
  -- tela de Acessos. O valor inicial aqui e so um chute informado.
  tipo          acesso_tipo_conta not null default 'pessoa',
  -- Nome do colaborador no RH, por TEXTO. Nao e chave estrangeira de proposito:
  -- o RH e outro app, com outro banco logico, e amarrar por id faria uma ficha
  -- apagada la derrubar o login aqui.
  colaborador   text not null default '',
  -- Preenchido quando a conta passar para o Supabase Auth (a virada).
  auth_user_id  uuid,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── o papel, POR SISTEMA ────────────────────────────────────────────────────
-- E isto que substitui "uma linha por pessoa por sistema": a pessoa e uma so,
-- o que muda por sistema e o que ela pode fazer.
create table if not exists acesso_papel (
  conta_id   uuid not null references acesso_conta(id) on delete cascade,
  sistema    text not null,
  papel      text not null default '',
  -- O painel nao usa "papel", usa lista de modulos. Em vez de forcar os dois
  -- num campo so (e perder informacao dos dois lados), cada um guarda o seu.
  permissoes jsonb not null default '[]'::jsonb,
  vendedor_id text not null default '',
  ativo      boolean not null default true,
  primary key (conta_id, sistema)
);
create index if not exists acesso_papel_sistema on acesso_papel (sistema);

-- ── a senha que a pessoa ja usa ─────────────────────────────────────────────
-- Guarda o hash PBKDF2 que hoje mora em equipe_contas/painel_contas, para a
-- MIGRACAO NA PRIMEIRA ENTRADA: a pessoa digita a senha de sempre, o servidor
-- confere contra estes hashes e, batendo, grava a mesma senha no Supabase Auth.
-- Ninguem recria senha e ninguem percebe a virada.
--
-- Uma linha POR ORIGEM de propósito: a Barbara tem senhas DIFERENTES no Brief e
-- no POPs. Aceitar qualquer uma das duas e o que evita ter de escolher por ela
-- -- ela digita a que lembrar, e essa vira a unica.
--
-- Some assim que a conta migrar (`usado_em` preenchido -> apagar no dia
-- seguinte). Hash de senha nao e coisa para ficar guardada "por via das duvidas".
create table if not exists acesso_senha_legado (
  conta_id  uuid not null references acesso_conta(id) on delete cascade,
  origem    text not null,               -- 'equipe:brief', 'painel', ...
  hash      text not null,
  salt      text not null,
  iter      int  not null default 120000,
  usado_em  timestamptz,
  primary key (conta_id, origem)
);

alter table acesso_conta         enable row level security;
alter table acesso_papel         enable row level security;
alter table acesso_senha_legado  enable row level security;

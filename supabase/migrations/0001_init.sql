-- ============================================================================
-- Painel de Gestao no Supabase (substitui o Netlify Blobs).
--
-- PROJETO COMPARTILHADO: aqui moram RH (nomes CRUS), Brief (brief_*), PCP
-- (pcp_*) e Central do Leo (leo_*). Tudo daqui leva o prefixo painel_.
--
-- De-para dos blobs:
--   config              -> painel_config_global
--   ov_rec / ov_orc     -> painel_registros, UMA LINHA POR MARCACAO
--   ativo_<id>          -> painel_registros (colecao='ativo')
--   arquivo_<id>        -> bucket painel-arquivos (PDF/imagem em base64 hoje)
--   backup_status       -> painel_meta
--   cache_*             -> painel_cache (DESCARTAVEL: nao se migra, se refaz)
--   store "painel-auth" -> painel_contas
--
-- POR QUE ov_rec/ov_orc VIRAM LINHAS, e nao um JSON so como no Blobs:
-- la, marcar UM orcamento reescrevia o arquivo INTEIRO. Com a leitura eventual
-- do Blobs, duas marcacoes seguidas se atropelavam e uma apagava a outra --
-- defeito real, que custou dado no modulo de ativos e quase se repetiu no
-- agendamento de retornos. Uma linha por marcacao elimina a classe do problema:
-- gravar uma nao toca nas outras.
-- ============================================================================

create table if not exists public.painel_registros (
  colecao       text not null,   -- 'ov_rec' | 'ov_orc' | 'ativo'
  id            text not null,   -- id do orcamento / recebivel / documento
  registro      jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (colecao, id)
);
create index if not exists painel_registros_colecao_idx on public.painel_registros (colecao);
alter table public.painel_registros enable row level security;

create table if not exists public.painel_config_global (
  id            boolean primary key default true check (id),
  config        jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.painel_config_global enable row level security;

-- Chave/valor para status e travas (backup_status, cache_status, cache_lock...).
create table if not exists public.painel_meta (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.painel_meta enable row level security;

-- Cache do Mubisys. Fica separado de proposito: e DESCARTAVEL e se reconstroi
-- sozinho na primeira carga. Nao entra na migracao nem no backup -- misturar
-- com dado de verdade so faria o backup engordar sem motivo.
create table if not exists public.painel_cache (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.painel_cache enable row level security;

-- Contas de acesso. A senha continua como HASH (PBKDF2), igual hoje -- o painel
-- tem login proprio e NAO usa o Supabase Auth, entao o hash mora aqui.
create table if not exists public.painel_contas (
  usuario       text primary key,      -- normalizado (sem acento, minusculo)
  nome          text,
  permissoes    jsonb not null default '[]'::jsonb,
  vendedor_id   text default '',       -- liga a conta ao vendedor do Mubisys
  hash          text not null,
  salt          text not null,
  iter          integer not null,
  atualizado_em timestamptz not null default now()
);
alter table public.painel_contas enable row level security;

-- Documentos e ativos (PDF/imagem). Bucket privado: so a Edge Function le.
insert into storage.buckets (id, name, public)
values ('painel-arquivos', 'painel-arquivos', false)
on conflict (id) do nothing;

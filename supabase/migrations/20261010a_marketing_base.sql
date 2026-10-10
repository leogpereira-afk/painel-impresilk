-- CENTRO DE COMANDO DO MARKETING, etapa a1: a base (10/10/2026).
--
-- As ações do Marketing saem da coleção genérica painel_registros "marketing"
-- (onde moravam misturadas com os atalhos do Drive) e ganham tabelas próprias.
-- Prefixo painel_mkt_ porque o projeto Supabase é dividido com RH, PCP, Brief
-- e Central: "acoes" ou "log" soltos confundiriam com os dos outros.
--
-- Ninguém lê nem grava estas tabelas direto: RLS ligado, sem policy e sem
-- grant para anon/authenticated. Tudo passa pela Edge Function
-- painel-marketing (service_role) e pelas funções abaixo, como as gestao_*.
--
-- O QUE MUDA DE VERDADE: a trava "um orçamento numa ação só" deixa de existir
-- só na tela. Ela vira a CHAVE PRIMÁRIA de painel_mkt_orcamento_vinculo: dois
-- aparelhos ligando o mesmo orçamento ao mesmo tempo, um dos dois recebe erro.
-- Antes, a tela conferia e o servidor aceitava qualquer coisa.

create table if not exists public.painel_mkt_acoes (
  id uuid primary key default gen_random_uuid(),
  -- id da linha antiga em painel_registros ("mkt-<uuid>"), só nas migradas.
  legado_id text unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  objetivo text,
  publico text,
  -- O chip do canal entra na etapa a2 (painel_mkt_canais). Até lá, e nas
  -- ações antigas, o canal é o texto escrito à mão.
  canal_id uuid,
  canal_texto text,
  -- Pessoa pelo id_pessoa (6 dígitos do CPF) a partir da etapa a2; o texto
  -- digitado fica guardado, nunca casado por nome.
  responsavel_id text,
  responsavel_texto text,
  -- Id da campanha do módulo Campanhas (texto, como lá). Etapa b.
  campanha_id text,
  prazo date not null,
  situacao text not null default 'Ideia'
    check (situacao in ('Ideia','Produção','Aprovação','Programada','Publicada','Encerrada')),
  investimento numeric(14,2) not null default 0 check (investimento >= 0),
  url text,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  migrado_em timestamptz,
  -- Retirar não apaga: a ação some da tela, os orçamentos ficam livres e o
  -- que estava ligado fica guardado aqui e no log.
  retirada_em timestamptz,
  retirada_por text,
  orcamentos_retirados text[]
);
create index if not exists painel_mkt_acoes_prazo on public.painel_mkt_acoes (prazo) where retirada_em is null;

-- UM ORÇAMENTO, UMA AÇÃO. A chave primária é o próprio orçamento (id do ERP,
-- String(o.id) do Mubi, o mesmo que a tela usa hoje).
create table if not exists public.painel_mkt_orcamento_vinculo (
  orcamento_id text primary key check (orcamento_id ~ '^[A-Za-z0-9_.-]{1,40}$'),
  acao_id uuid not null references public.painel_mkt_acoes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por text
);
create index if not exists painel_mkt_orcamento_vinculo_acao on public.painel_mkt_orcamento_vinculo (acao_id);

-- LOG DE AUDITORIA de todas as edições, escrito pelo BANCO (gatilho), não
-- pela tela: nenhuma gravação escapa, nem a de um caminho esquecido. Guarda
-- custo (investimento), nunca valor vendido.
create table if not exists public.painel_mkt_log (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  quem text,
  tabela text not null,
  registro_id text not null,
  operacao text not null,
  antes jsonb,
  depois jsonb,
  motivo text
);
create index if not exists painel_mkt_log_registro on public.painel_mkt_log (tabela, registro_id, em desc);

alter table public.painel_mkt_acoes enable row level security;
alter table public.painel_mkt_orcamento_vinculo enable row level security;
alter table public.painel_mkt_log enable row level security;
revoke all on table public.painel_mkt_acoes, public.painel_mkt_orcamento_vinculo, public.painel_mkt_log from anon, authenticated;

create or replace function public.painel_mkt_registrar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Toda gravação deixa linha, inclusive a volta de um backup (com o motivo
  -- "Volta do backup"): a volta muda ação e tira orçamento de outra, e quem
  -- audita precisa ver que ela aconteceu.
  insert into public.painel_mkt_log (quem, tabela, registro_id, operacao, antes, depois, motivo)
  values (nullif(current_setting('painel.quem', true), ''), tg_table_name,
          coalesce(depois->>'id', depois->>'orcamento_id', antes->>'id', antes->>'orcamento_id'),
          lower(tg_op), antes, depois, nullif(current_setting('painel.motivo', true), ''));
  return null;
end $$;

drop trigger if exists painel_mkt_acoes_log on public.painel_mkt_acoes;
create trigger painel_mkt_acoes_log after insert or update or delete on public.painel_mkt_acoes
  for each row execute function public.painel_mkt_registrar();
drop trigger if exists painel_mkt_orcamento_vinculo_log on public.painel_mkt_orcamento_vinculo;
create trigger painel_mkt_orcamento_vinculo_log after insert or update or delete on public.painel_mkt_orcamento_vinculo
  for each row execute function public.painel_mkt_registrar();

-- SALVAR UMA AÇÃO e os orçamentos dela, numa transação só.
-- p_id nulo cria; p_id com p_versao edita (versão diferente = alguém mexeu
-- antes: 40001, a tela pede para reabrir). A validação de cada campo é da
-- Edge Function (supabase/functions/_shared/marketing.mjs); aqui ficam o que
-- só o banco garante: versão, retirada e a trava do orçamento.
create or replace function public.painel_mkt_salvar_acao(p_id uuid, p_dados jsonb, p_orcamentos text[], p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.painel_mkt_acoes; orcs text[]; ocupado record; atuais text[];
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  orcs := coalesce((select array_agg(distinct btrim(x) order by btrim(x)) from unnest(coalesce(p_orcamentos, '{}'::text[])) x where btrim(x) <> ''), '{}');
  if p_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('painel:mkt:acao:' || p_id::text, 0));
    select * into a from public.painel_mkt_acoes where id = p_id for update;
  end if;
  if p_id is not null and p_versao is null then
    -- CRIAR COM O ID QUE A TELA GEROU. A resposta pode se perder no caminho
    -- (rede da rua); o "tentar de novo" manda o mesmo id e recebe a mesma
    -- ação, em vez de criar uma segunda igual.
    if found then
      if a.criado_por is distinct from p_quem or a.retirada_em is not null then
        raise exception 'Ação não encontrada' using errcode = 'P0002';
      end if;
      select coalesce(array_agg(orcamento_id order by orcamento_id), '{}') into atuais from public.painel_mkt_orcamento_vinculo where acao_id = a.id;
      return to_jsonb(a) || jsonb_build_object('orcamentos', to_jsonb(atuais));
    end if;
    insert into public.painel_mkt_acoes (id, nome, objetivo, publico, canal_texto, responsavel_texto, prazo, situacao, investimento, url, criado_por, atualizado_por)
    values (p_id, p_dados->>'nome', p_dados->>'objetivo', p_dados->>'publico', p_dados->>'canal_texto', p_dados->>'responsavel_texto',
            (p_dados->>'prazo')::date, coalesce(p_dados->>'situacao', 'Ideia'), coalesce((p_dados->>'investimento')::numeric, 0),
            p_dados->>'url', p_quem, p_quem)
    returning * into a;
  elsif p_id is not null then
    if not found or a.retirada_em is not null then raise exception 'Ação não encontrada' using errcode = 'P0002'; end if;
    if p_versao is distinct from a.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
    update public.painel_mkt_acoes set
      nome = p_dados->>'nome', objetivo = p_dados->>'objetivo', publico = p_dados->>'publico',
      canal_texto = p_dados->>'canal_texto', responsavel_texto = p_dados->>'responsavel_texto',
      prazo = (p_dados->>'prazo')::date, situacao = p_dados->>'situacao',
      investimento = coalesce((p_dados->>'investimento')::numeric, 0), url = p_dados->>'url',
      versao = a.versao + 1, atualizado_em = now(), atualizado_por = p_quem
    where id = p_id returning * into a;
  else
    if p_versao is not null then raise exception 'Ação não encontrada' using errcode = 'P0002'; end if;
    insert into public.painel_mkt_acoes (nome, objetivo, publico, canal_texto, responsavel_texto, prazo, situacao, investimento, url, criado_por, atualizado_por)
    values (p_dados->>'nome', p_dados->>'objetivo', p_dados->>'publico', p_dados->>'canal_texto', p_dados->>'responsavel_texto',
            (p_dados->>'prazo')::date, coalesce(p_dados->>'situacao', 'Ideia'), coalesce((p_dados->>'investimento')::numeric, 0),
            p_dados->>'url', p_quem, p_quem)
    returning * into a;
  end if;
  -- A TRAVA. A conferência dá a mensagem com o nome da outra ação; a chave
  -- primária segura a corrida (dois aparelhos ao mesmo tempo: o segundo insert
  -- espera o primeiro e falha com 23505).
  select v.orcamento_id, x.nome into ocupado
    from public.painel_mkt_orcamento_vinculo v join public.painel_mkt_acoes x on x.id = v.acao_id
   where v.orcamento_id = any(orcs) and v.acao_id <> a.id limit 1;
  if found then
    raise exception 'Orçamento já vinculado' using errcode = '23505',
      detail = json_build_object('orcamento', ocupado.orcamento_id, 'acao', ocupado.nome)::text;
  end if;
  delete from public.painel_mkt_orcamento_vinculo where acao_id = a.id and not (orcamento_id = any(orcs));
  insert into public.painel_mkt_orcamento_vinculo (orcamento_id, acao_id, criado_por)
    select x, a.id, p_quem from unnest(orcs) x
     where not exists (select 1 from public.painel_mkt_orcamento_vinculo v where v.orcamento_id = x and v.acao_id = a.id);
  return to_jsonb(a) || jsonb_build_object('orcamentos', to_jsonb(orcs));
end $$;

-- RETIRAR: a ação sai da tela e libera os orçamentos; nada é apagado.
create or replace function public.painel_mkt_retirar_acao(p_id uuid, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.painel_mkt_acoes; orcs text[];
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:acao:' || p_id::text, 0));
  select * into a from public.painel_mkt_acoes where id = p_id for update;
  if not found or a.retirada_em is not null then raise exception 'Ação não encontrada' using errcode = 'P0002'; end if;
  if p_versao is distinct from a.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
  select coalesce(array_agg(orcamento_id order by orcamento_id), '{}') into orcs from public.painel_mkt_orcamento_vinculo where acao_id = p_id;
  delete from public.painel_mkt_orcamento_vinculo where acao_id = p_id;
  update public.painel_mkt_acoes set retirada_em = now(), retirada_por = p_quem, orcamentos_retirados = orcs,
    versao = a.versao + 1, atualizado_em = now(), atualizado_por = p_quem
  where id = p_id returning * into a;
  return to_jsonb(a);
end $$;

-- AS AÇÕES ANTIGAS (painel_registros "marketing", tipo "acao") PARA A TABELA.
-- Em 10/10/2026 não havia nenhuma em produção; a função existe para o caso de
-- alguém criar uma pela tela velha antes da troca. Pode rodar de novo: o
-- legado_id único faz a segunda vez não duplicar. Orçamento repetido entre
-- ações antigas trava tudo, com a lista, em vez de escolher calado.
create or replace function public.painel_mkt_migrar_legado(p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare leg record; novo uuid; novas int := 0; vinculos int := 0; total int := 0; dup text; k int;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform set_config('painel.motivo', 'Migração das ações antigas do Marketing', true);
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:migrar', 0));
  select string_agg(o, ', ' order by o) into dup from (
    select o from public.painel_registros pr, jsonb_array_elements_text(case when jsonb_typeof(pr.registro->'orcamentos') = 'array' then pr.registro->'orcamentos' else '[]'::jsonb end) o
     where pr.colecao = 'marketing' and pr.registro->>'tipo' = 'acao' group by o having count(*) > 1) d;
  if dup is not null then raise exception 'Orçamento repetido entre ações antigas: %', dup using errcode = '23505'; end if;
  -- Orçamento de ação antiga que já foi ligado a uma ação nova: trava com o
  -- nome da ação nova, no formato que a tela já sabe explicar.
  select o.o as orcamento, x.nome into leg
    from public.painel_registros pr
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(pr.registro->'orcamentos') = 'array' then pr.registro->'orcamentos' else '[]'::jsonb end) o(o)
    join public.painel_mkt_orcamento_vinculo v on v.orcamento_id = o.o
    join public.painel_mkt_acoes x on x.id = v.acao_id
   where pr.colecao = 'marketing' and pr.registro->>'tipo' = 'acao'
     and not exists (select 1 from public.painel_mkt_acoes m where m.legado_id = pr.id)
   limit 1;
  if found then
    raise exception 'Orçamento já vinculado' using errcode = '23505',
      detail = json_build_object('orcamento', leg.orcamento, 'acao', leg.nome)::text;
  end if;
  for leg in select id, registro, atualizado_em from public.painel_registros where colecao = 'marketing' and registro->>'tipo' = 'acao' order by id loop
    total := total + 1;
    insert into public.painel_mkt_acoes (legado_id, nome, objetivo, publico, canal_texto, responsavel_texto, prazo, situacao, investimento, url, criado_por, atualizado_por, migrado_em)
    values (leg.id,
      left(coalesce(nullif(btrim(leg.registro->>'nome'), ''), 'Ação sem nome'), 200),
      nullif(btrim(leg.registro->>'objetivo'), ''), nullif(btrim(leg.registro->>'publico'), ''),
      nullif(btrim(leg.registro->>'canal'), ''), nullif(btrim(leg.registro->>'responsavel'), ''),
      case when leg.registro->>'prazo' ~ '^\d{4}-\d{2}-\d{2}$' then (leg.registro->>'prazo')::date else (leg.atualizado_em at time zone 'America/Sao_Paulo')::date end,
      case when leg.registro->>'status' in ('Ideia','Produção','Aprovação','Programada','Publicada','Encerrada') then leg.registro->>'status' else 'Ideia' end,
      case when leg.registro->>'investimento' ~ '^\d+(\.\d+)?$' then round((leg.registro->>'investimento')::numeric, 2) else 0 end,
      nullif(btrim(leg.registro->>'url'), ''), p_quem, p_quem, now())
    on conflict (legado_id) do nothing
    returning id into novo;
    if novo is not null then
      novas := novas + 1;
      insert into public.painel_mkt_orcamento_vinculo (orcamento_id, acao_id, criado_por)
        select distinct o, novo, p_quem from jsonb_array_elements_text(case when jsonb_typeof(leg.registro->'orcamentos') = 'array' then leg.registro->'orcamentos' else '[]'::jsonb end) o
         where o ~ '^[A-Za-z0-9_.-]{1,40}$';
      get diagnostics k = row_count; vinculos := vinculos + k;
    end if;
    novo := null;
  end loop;
  return jsonb_build_object('total', total, 'migradas', novas, 'vinculos', vinculos);
end $$;

-- A VOLTA DO BACKUP para as tabelas do Marketing. Mesma regra do resto do
-- painel: o que está no arquivo volta, o que nasceu depois fica (nada é
-- apagado). Backup de antes desta etapa não tem a parte do Marketing e não
-- mexe em nada. O vínculo do mesmo orçamento é trocado pelo do arquivo, para
-- a trava não abortar a volta inteira.
create or replace function public.painel_mkt_restaurar(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k int; acoes jsonb; vinc jsonb; logs jsonb;
begin
  if p is null or p = 'null'::jsonb then return 0; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Marketing inválido no backup'; end if;
  acoes := coalesce(p->'painel_mkt_acoes', '[]'); vinc := coalesce(p->'painel_mkt_orcamento_vinculo', '[]'); logs := coalesce(p->'painel_mkt_log', '[]');
  if jsonb_typeof(acoes) <> 'array' or jsonb_typeof(vinc) <> 'array' or jsonb_typeof(logs) <> 'array' then raise exception 'Tabela do Marketing inválida no backup'; end if;
  perform set_config('painel.quem', coalesce(p->>'quem', 'backup'), true);
  perform set_config('painel.motivo', 'Volta do backup', true);
  -- A versão NUNCA volta para um número que já existiu: uma aba aberta antes
  -- da volta não pode gravar por cima sem conflito.
  insert into public.painel_mkt_acoes select * from jsonb_populate_recordset(null::public.painel_mkt_acoes, acoes)
    on conflict (id) do update set legado_id = excluded.legado_id, nome = excluded.nome, objetivo = excluded.objetivo,
      publico = excluded.publico, canal_id = excluded.canal_id, canal_texto = excluded.canal_texto,
      responsavel_id = excluded.responsavel_id, responsavel_texto = excluded.responsavel_texto,
      campanha_id = excluded.campanha_id, prazo = excluded.prazo, situacao = excluded.situacao,
      investimento = excluded.investimento, url = excluded.url,
      versao = greatest(painel_mkt_acoes.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(),
      atualizado_por = coalesce(p->>'quem', 'backup'), migrado_em = excluded.migrado_em, retirada_em = excluded.retirada_em,
      retirada_por = excluded.retirada_por, orcamentos_retirados = excluded.orcamentos_retirados;
  get diagnostics k = row_count; n := n + k;
  -- Os orçamentos de cada ação do arquivo ficam IGUAIS aos do arquivo (uma
  -- ação que o arquivo dá como retirada não pode segurar orçamento), e o
  -- orçamento que o arquivo dá a uma ação sai de quem o tem hoje.
  delete from public.painel_mkt_orcamento_vinculo v
   where v.acao_id in (select (x->>'id')::uuid from jsonb_array_elements(acoes) x)
     and not exists (select 1 from jsonb_array_elements(vinc) b where b->>'orcamento_id' = v.orcamento_id and (b->>'acao_id')::uuid = v.acao_id);
  delete from public.painel_mkt_orcamento_vinculo v
   where v.orcamento_id in (select b->>'orcamento_id' from jsonb_array_elements(vinc) b);
  -- Vínculo sem a ação (cópia tirada no meio de uma gravação) não aborta a
  -- volta do painel inteiro: fica de fora.
  insert into public.painel_mkt_orcamento_vinculo
    select distinct on (b.orcamento_id) b.* from jsonb_populate_recordset(null::public.painel_mkt_orcamento_vinculo, vinc) b
     where exists (select 1 from public.painel_mkt_acoes x where x.id = b.acao_id and x.retirada_em is null)
     order by b.orcamento_id, b.criado_em desc;
  get diagnostics k = row_count; n := n + k;
  insert into public.painel_mkt_log select * from jsonb_populate_recordset(null::public.painel_mkt_log, logs) on conflict (id) do nothing;
  get diagnostics k = row_count; n := n + k;
  perform set_config('painel.motivo', '', true);
  return n;
end $$;

-- A CÓPIA DO MARKETING PARA O BACKUP, num retrato só. Uma função SQL de um
-- comando lê as três tabelas no MESMO instante: copiar uma de cada vez
-- deixava escapar o vínculo de uma ação salva entre as leituras, e a volta
-- desse arquivo abortaria. De quebra, devolve a lista das tabelas
-- painel_mkt_* que existem, para o backup reprovar a que ficar fora.
create or replace function public.painel_mkt_exportar()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tabelas', (select coalesce(jsonb_agg(tablename order by tablename), '[]') from pg_tables where schemaname = 'public' and tablename like 'painel\_mkt\_%'),
    'painel_mkt_acoes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_acoes x),
    'painel_mkt_orcamento_vinculo', (select coalesce(jsonb_agg(to_jsonb(x) order by x.orcamento_id), '[]') from public.painel_mkt_orcamento_vinculo x),
    'painel_mkt_log', (select coalesce(jsonb_agg(to_jsonb(x) order by x.em, x.id), '[]') from public.painel_mkt_log x));
$$;

-- A volta atômica do painel passa a levar o Marketing junto (mesma transação).
-- Corpo idêntico ao que estava em produção em 10/10/2026 (conferido por
-- pg_get_functiondef), com UMA linha nova antes do return.
create or replace function public.painel_restaurar_atomico(p_backup jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; t text; linhas jsonb; cols text; chaves text; atualizacoes text;
 gravou int:=0; contas int:=0; afetadas int; retornaram jsonb:='[]';
 tabelas constant text[]:=array['gestao_empresa','gestao_identidade','gestao_valor','gestao_plano_ano','gestao_objetivo','gestao_indicador','gestao_tatica','gestao_reuniao','gestao_decisao','gestao_ciclo_fechamento','gestao_preferencia_ui'];
begin
 if jsonb_typeof(p_backup)<>'object' or jsonb_typeof(p_backup->'registros')<>'array' or jsonb_typeof(p_backup->'contas')<>'array' then raise exception 'Backup inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:config',0));
 if p_backup->'config' is not null and p_backup->'config'<>'null'::jsonb then
  if jsonb_typeof(p_backup->'config')<>'object' then raise exception 'Configuração inválida'; end if;
  insert into public.painel_config_global(id,config,atualizado_em) values(true,p_backup->'config',now())
   on conflict(id) do update set config=excluded.config,atualizado_em=excluded.atualizado_em;
  gravou:=gravou+1;
 end if;
 foreach t in array tabelas loop
  linhas:=p_backup->'gestao'->t;
  if linhas is null or linhas='null'::jsonb then continue; end if;
  if jsonb_typeof(linhas)<>'array' then raise exception 'Tabela % inválida',t; end if;
  select string_agg(quote_ident(a.attname),',' order by a.attnum),string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
   into cols,atualizacoes from pg_attribute a where a.attrelid=to_regclass('public.'||t) and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into chaves from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=to_regclass('public.'||t) and i.indisprimary;
  if cols is null or chaves is null then raise exception 'Tabela de recuperação indisponível: %',t; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) on conflict (%s) do update set %s',t,cols,cols,t,chaves,atualizacoes) using linhas;
  get diagnostics afetadas=row_count; gravou:=gravou+afetadas;
 end loop;
 for r in select * from jsonb_array_elements(p_backup->'registros') loop
  if nullif(r->>'colecao','') is null or nullif(r->>'id','') is null or jsonb_typeof(r->'registro')<>'object' then raise exception 'Registro inválido no backup'; end if;
  insert into public.painel_registros(colecao,id,registro,atualizado_em) values(r->>'colecao',r->>'id',r->'registro',now())
   on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=excluded.atualizado_em;
  if not exists(select 1 from public.painel_registros where colecao=r->>'colecao' and id=r->>'id' and registro=r->'registro') then raise exception 'Verificação de registro falhou'; end if;
  gravou:=gravou+1;
 end loop;
 for r in select * from jsonb_array_elements(p_backup->'contas') loop
  if nullif(r->>'usuario','') is null or nullif(r->>'hash','') is null or nullif(r->>'salt','') is null then raise exception 'Conta inválida no backup'; end if;
  if not exists(select 1 from public.painel_contas where usuario=r->>'usuario') then retornaram:=retornaram||jsonb_build_array(coalesce(r->>'nome',r->>'usuario')); end if;
  insert into public.painel_contas(usuario,nome,permissoes,vendedor_id,hash,salt,iter,atualizado_em)
   values(r->>'usuario',r->>'nome',coalesce(r->'permissoes','[]'),coalesce(r->>'vendedorId',''),r->>'hash',r->>'salt',coalesce((r->>'iter')::int,120000),now())
   on conflict(usuario) do update set nome=excluded.nome,permissoes=excluded.permissoes,vendedor_id=excluded.vendedor_id,hash=excluded.hash,salt=excluded.salt,iter=excluded.iter,atualizado_em=excluded.atualizado_em;
  contas:=contas+1;
 end loop;
 gravou:=gravou+public.painel_mkt_restaurar(p_backup->'marketing');
 return jsonb_build_object('gravou',gravou,'contas',contas,'ressuscitadas',retornaram,'verificado',true);
end $$;

revoke all on function public.painel_mkt_registrar(), public.painel_mkt_exportar(), public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text),
  public.painel_mkt_retirar_acao(uuid,integer,text), public.painel_mkt_migrar_legado(text), public.painel_mkt_restaurar(jsonb),
  public.painel_restaurar_atomico(jsonb) from public, anon, authenticated;
grant execute on function public.painel_mkt_exportar(), public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text),
  public.painel_mkt_retirar_acao(uuid,integer,text), public.painel_mkt_migrar_legado(text), public.painel_mkt_restaurar(jsonb),
  public.painel_restaurar_atomico(jsonb) to service_role;

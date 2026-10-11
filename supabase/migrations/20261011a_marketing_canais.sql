-- CENTRO DE COMANDO DO MARKETING, etapa a2: canais, playbook, números e
-- papéis (11/10/2026). Contrato em docs/marketing/a2-contrato.md.
--
-- Mesmo padrão da a1 (20261010a_marketing_base.sql): prefixo painel_mkt_,
-- RLS ligado sem policy, nada para anon/authenticated, toda escrita por
-- função security definer chamada pela Edge Function painel-marketing
-- (service_role), gatilho de log em toda tabela, versão otimista.
--
-- O QUE ESTA ETAPA GARANTE NO BANCO, e não só na tela:
--  * o canal tem código único e estável: é a chave da carga padrão, do
--    endereço da tela (?v=instagram) e da ligação com o Comercial. Depois de
--    criado, o código não muda (o nome muda à vontade);
--  * uma publicação com link entra uma vez só por canal (o CSV não duplica);
--  * os números da semana são uma linha por canal e semana;
--  * número não informado fica NULO, nunca vira zero: zero é resultado,
--    nulo é "ninguém mediu";
--  * a carga padrão nunca sobrescreve o que a casa editou.

-- ---------------------------------------------------------------- canais --
create table if not exists public.painel_mkt_canais (
  id uuid primary key default gen_random_uuid(),
  -- 'geral' e 'materiais' são vistas fixas da página (?v=); um canal com esse
  -- código tomaria o lugar da vista. CODIGOS_RESERVADOS em _shared/marketing.mjs.
  codigo text not null constraint painel_mkt_canais_codigo unique
    check (codigo ~ '^[a-z0-9_-]{2,30}$' and codigo not in ('geral', 'materiais')),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  grupo text not null check (grupo in ('digital','contato','offline')),
  -- A lista de ícones é da tela (src/components/ChipCanal.jsx desenha) e do
  -- servidor (_shared/marketing.mjs confere). Aqui só o formato: um ícone
  -- novo não precisa de migração.
  icone text not null check (icone ~ '^[a-z][a-z-]{1,29}$'),
  cor text not null check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem integer not null default 0,
  -- Desativar em vez de apagar: as ações, publicações e números antigos
  -- continuam apontando para um canal que existe.
  ativo boolean not null default true,
  em_implantacao boolean not null default false,
  url_perfil text check (url_perfil is null or (url_perfil ~* '^https?://' and length(url_perfil) <= 500)),
  url_gerenciador text check (url_gerenciador is null or (url_gerenciador ~* '^https?://' and length(url_gerenciador) <= 500)),
  mensagem_whatsapp text check (mensagem_whatsapp is null or length(mensagem_whatsapp) <= 300),
  -- Canal sem publicação há mais que isso fica vermelho. Editável por canal.
  dias_parado integer not null default 7 check (dias_parado between 1 and 90),
  -- Código do canal do Comercial (CANAIS em _shared/relacionamento-comercial.mjs),
  -- quando houver. A lista é de lá; aqui só o formato.
  comercial_canal text check (comercial_canal is null or comercial_canal ~ '^[a-z_]{2,30}$'),
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- -------------------------------------------------------------- playbook --
-- Item do playbook: ação única, rotina (com recorrência e meta) ou gatilho
-- (evento do sistema). As regras que amarram um campo ao outro ficam aqui
-- também, para nenhum caminho (nem a volta de um backup mexido) gravar uma
-- rotina sem recorrência ou um gatilho sem evento.
create table if not exists public.painel_mkt_playbook (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null,
  -- Só nos itens da carga padrão (é o que torna a carga idempotente).
  codigo text constraint painel_mkt_playbook_codigo unique check (codigo is null or codigo ~ '^[a-z0-9_-]{2,40}$'),
  tipo text not null check (tipo in ('unica','rotina','gatilho')),
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  instrucao text check (instrucao is null or length(instrucao) <= 2000),
  -- Responsável padrão pelo id_pessoa (6 dígitos do CPF), nunca pelo nome.
  responsavel_id text check (responsavel_id is null or responsavel_id ~ '^[0-9]{6,11}$'),
  recorrencia text check (recorrencia is null or recorrencia in ('diaria','semanal','mensal','cada_n_dias')),
  a_cada_dias integer check (a_cada_dias is null or a_cada_dias between 1 and 365),
  meta_quantidade integer check (meta_quantidade is null or meta_quantidade between 1 and 999),
  prazo_dias integer check (prazo_dias is null or prazo_dias between 0 and 365),
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  evidencia text not null default 'nenhuma' check (evidencia in ('nenhuma','link','foto','texto')),
  gatilho text check (gatilho is null or length(btrim(gatilho)) between 1 and 60),
  implantacao boolean not null default false,
  concluido_em timestamptz,
  concluido_por text,
  evidencia_valor text check (evidencia_valor is null or length(evidencia_valor) <= 1000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  constraint painel_mkt_playbook_rotina check ((tipo = 'rotina') = (recorrencia is not null)),
  constraint painel_mkt_playbook_cada_n check ((recorrencia is not distinct from 'cada_n_dias') = (a_cada_dias is not null)),
  constraint painel_mkt_playbook_meta check (meta_quantidade is null or tipo = 'rotina'),
  constraint painel_mkt_playbook_gatilho check ((tipo = 'gatilho') = (gatilho is not null)),
  -- Concluir é coisa de ação única (a implantação é feita delas). Rotina e
  -- gatilho viram tarefa na agenda (etapa a3) e se concluem lá.
  constraint painel_mkt_playbook_implantacao check (not implantacao or tipo = 'unica'),
  constraint painel_mkt_playbook_concluido check (concluido_em is null or tipo = 'unica')
);
create index if not exists painel_mkt_playbook_canal on public.painel_mkt_playbook (canal_id, ordem);

-- ----------------------------------------------------------- publicações --
create table if not exists public.painel_mkt_publicacoes (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null,
  data date not null,
  titulo text check (titulo is null or length(titulo) <= 200),
  url text check (url is null or (url ~* '^https?://' and length(url) <= 500)),
  acao_id uuid references public.painel_mkt_acoes(id) on delete set null,
  alcance integer check (alcance is null or alcance between 0 and 1000000000),
  impressoes integer check (impressoes is null or impressoes between 0 and 1000000000),
  engajamento integer check (engajamento is null or engajamento between 0 and 1000000000),
  cliques integer check (cliques is null or cliques between 0 and 1000000000),
  leads integer check (leads is null or leads between 0 and 1000000000),
  fonte text not null check (fonte in ('manual','csv','api')),
  -- "Fonte e data" de todo número: quando o número foi lançado ou coletado.
  coletado_em timestamptz not null default now(),
  -- Retirar não apaga: some da tela, o número fica guardado e no log.
  retirada_em timestamptz,
  retirada_por text,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  -- O mesmo link duas vezes no mesmo canal é a mesma publicação. Sem link,
  -- não há como saber, e por isso entra sempre (nulos não colidem).
  constraint painel_mkt_publicacoes_canal_url unique (canal_id, url)
);
create index if not exists painel_mkt_publicacoes_data on public.painel_mkt_publicacoes (canal_id, data desc) where retirada_em is null;
create index if not exists painel_mkt_publicacoes_acao on public.painel_mkt_publicacoes (acao_id) where acao_id is not null;

-- --------------------------------------------- números da semana (canal) --
create table if not exists public.painel_mkt_metricas_canal (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null,
  -- Segunda-feira da semana (o banco recusa outro dia).
  semana date not null check (extract(isodow from semana) = 1),
  seguidores integer check (seguidores is null or seguidores between 0 and 1000000000),
  alcance integer check (alcance is null or alcance between 0 and 1000000000),
  impressoes integer check (impressoes is null or impressoes between 0 and 1000000000),
  engajamento integer check (engajamento is null or engajamento between 0 and 1000000000),
  cliques integer check (cliques is null or cliques between 0 and 1000000000),
  conversas integer check (conversas is null or conversas between 0 and 1000000000),
  leads integer check (leads is null or leads between 0 and 1000000000),
  fonte text not null check (fonte in ('manual','csv','api')),
  coletado_em timestamptz not null default now(),
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  constraint painel_mkt_metricas_canal_semana unique (canal_id, semana)
);

-- ------------------------------------------------- papéis do Marketing --
-- Quem não está aqui é "marketing" (o padrão de quem tem o módulo); a
-- direção é sempre "gestao", decidido na Edge Function. Pessoa pelo
-- id_pessoa, a mesma chave do acesso_conta e do RH.
create table if not exists public.painel_mkt_papeis (
  id_pessoa text primary key check (id_pessoa ~ '^[0-9]{6,11}$'),
  papel text not null check (papel in ('gestao','marketing','visualizacao')),
  definido_por text,
  definido_em timestamptz not null default now()
);

-- ------------------------------------------------- ligações com o canal --
-- ON UPDATE CASCADE em todas: a volta de um backup pode trocar o id de um
-- canal que nasceu depois com o mesmo código pelo id do arquivo, e tudo o
-- que apontava para ele vai junto (ver painel_mkt_restaurar). Apagar canal
-- não existe (desativa); o "restrict" do delete é a rede de segurança.
alter table public.painel_mkt_playbook drop constraint if exists painel_mkt_playbook_canal_fk;
alter table public.painel_mkt_playbook add constraint painel_mkt_playbook_canal_fk
  foreign key (canal_id) references public.painel_mkt_canais(id) on update cascade;
alter table public.painel_mkt_publicacoes drop constraint if exists painel_mkt_publicacoes_canal_fk;
alter table public.painel_mkt_publicacoes add constraint painel_mkt_publicacoes_canal_fk
  foreign key (canal_id) references public.painel_mkt_canais(id) on update cascade;
alter table public.painel_mkt_metricas_canal drop constraint if exists painel_mkt_metricas_canal_canal_fk;
alter table public.painel_mkt_metricas_canal add constraint painel_mkt_metricas_canal_canal_fk
  foreign key (canal_id) references public.painel_mkt_canais(id) on update cascade;

-- A coluna canal_id da ação existe desde a a1, sem ligação. Em 10/10/2026
-- nenhuma ação tinha canal_id (a a1 nunca gravou nele); a limpeza abaixo só
-- existe para a ligação nunca falhar por um id solto.
update public.painel_mkt_acoes a set canal_id = null
 where a.canal_id is not null and not exists (select 1 from public.painel_mkt_canais c where c.id = a.canal_id);
alter table public.painel_mkt_acoes drop constraint if exists painel_mkt_acoes_canal_fk;
alter table public.painel_mkt_acoes add constraint painel_mkt_acoes_canal_fk
  foreign key (canal_id) references public.painel_mkt_canais(id) on delete set null on update cascade;
alter table public.painel_mkt_acoes drop constraint if exists painel_mkt_acoes_responsavel_id_formato;
alter table public.painel_mkt_acoes add constraint painel_mkt_acoes_responsavel_id_formato
  check (responsavel_id is null or responsavel_id ~ '^[0-9]{6,11}$');
create index if not exists painel_mkt_acoes_canal on public.painel_mkt_acoes (canal_id) where canal_id is not null;

alter table public.painel_mkt_canais enable row level security;
alter table public.painel_mkt_playbook enable row level security;
alter table public.painel_mkt_publicacoes enable row level security;
alter table public.painel_mkt_metricas_canal enable row level security;
alter table public.painel_mkt_papeis enable row level security;
revoke all on table public.painel_mkt_canais, public.painel_mkt_playbook, public.painel_mkt_publicacoes,
  public.painel_mkt_metricas_canal, public.painel_mkt_papeis from anon, authenticated;

-- O LOG DA A1, agora sabendo achar a chave de painel_mkt_papeis (id_pessoa).
-- Sem isso, a primeira gravação de papel falharia: registro_id é not null.
create or replace function public.painel_mkt_registrar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Toda gravação deixa linha, inclusive a volta de um backup (com o motivo
  -- "Volta do backup") e a carga padrão.
  insert into public.painel_mkt_log (quem, tabela, registro_id, operacao, antes, depois, motivo)
  values (nullif(current_setting('painel.quem', true), ''), tg_table_name,
          coalesce(depois->>'id', depois->>'orcamento_id', depois->>'id_pessoa', antes->>'id', antes->>'orcamento_id', antes->>'id_pessoa'),
          lower(tg_op), antes, depois, nullif(current_setting('painel.motivo', true), ''));
  return null;
end $$;

drop trigger if exists painel_mkt_canais_log on public.painel_mkt_canais;
create trigger painel_mkt_canais_log after insert or update or delete on public.painel_mkt_canais
  for each row execute function public.painel_mkt_registrar();
drop trigger if exists painel_mkt_playbook_log on public.painel_mkt_playbook;
create trigger painel_mkt_playbook_log after insert or update or delete on public.painel_mkt_playbook
  for each row execute function public.painel_mkt_registrar();
drop trigger if exists painel_mkt_publicacoes_log on public.painel_mkt_publicacoes;
create trigger painel_mkt_publicacoes_log after insert or update or delete on public.painel_mkt_publicacoes
  for each row execute function public.painel_mkt_registrar();
drop trigger if exists painel_mkt_metricas_canal_log on public.painel_mkt_metricas_canal;
create trigger painel_mkt_metricas_canal_log after insert or update or delete on public.painel_mkt_metricas_canal
  for each row execute function public.painel_mkt_registrar();
drop trigger if exists painel_mkt_papeis_log on public.painel_mkt_papeis;
create trigger painel_mkt_papeis_log after insert or update or delete on public.painel_mkt_papeis
  for each row execute function public.painel_mkt_registrar();

-- ------------------------------------------------------- salvar canal --
-- Mesmo jeito da ação (a1): p_id nulo cria; p_id sem versão cria com o id
-- que a tela gerou (repetir o pedido devolve o mesmo canal); p_id com versão
-- edita (versão diferente: 40001). Os campos já chegam conferidos pela Edge
-- Function (_shared/marketing.mjs). O código não muda na edição.
create or replace function public.painel_mkt_salvar_canal(p_id uuid, p_dados jsonb, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.painel_mkt_canais; achou boolean := false;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if p_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('painel:mkt:canal:' || p_id::text, 0));
    select * into c from public.painel_mkt_canais where id = p_id for update;
    achou := found;
  end if;
  if p_id is not null and p_versao is not null then
    if not achou then raise exception 'Canal não encontrado' using errcode = 'P0002'; end if;
    if p_versao is distinct from c.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
    update public.painel_mkt_canais set
      nome = p_dados->>'nome', grupo = p_dados->>'grupo', icone = p_dados->>'icone', cor = p_dados->>'cor',
      ordem = coalesce((p_dados->>'ordem')::int, 0), ativo = coalesce((p_dados->>'ativo')::boolean, true),
      em_implantacao = coalesce((p_dados->>'em_implantacao')::boolean, false),
      url_perfil = p_dados->>'url_perfil', url_gerenciador = p_dados->>'url_gerenciador',
      mensagem_whatsapp = p_dados->>'mensagem_whatsapp', dias_parado = coalesce((p_dados->>'dias_parado')::int, 7),
      comercial_canal = p_dados->>'comercial_canal',
      versao = c.versao + 1, atualizado_em = now(), atualizado_por = p_quem
    where id = p_id returning * into c;
    return to_jsonb(c);
  end if;
  if p_id is null and p_versao is not null then raise exception 'Canal não encontrado' using errcode = 'P0002'; end if;
  if p_id is not null and achou then
    if c.criado_por is distinct from p_quem then raise exception 'Canal não encontrado' using errcode = 'P0002'; end if;
    return to_jsonb(c);
  end if;
  insert into public.painel_mkt_canais (id, codigo, nome, grupo, icone, cor, ordem, ativo, em_implantacao, url_perfil, url_gerenciador,
                                       mensagem_whatsapp, dias_parado, comercial_canal, criado_por, atualizado_por)
  values (coalesce(p_id, gen_random_uuid()), p_dados->>'codigo', p_dados->>'nome', p_dados->>'grupo', p_dados->>'icone', p_dados->>'cor',
          coalesce((p_dados->>'ordem')::int, 0), coalesce((p_dados->>'ativo')::boolean, true),
          coalesce((p_dados->>'em_implantacao')::boolean, false), p_dados->>'url_perfil', p_dados->>'url_gerenciador',
          p_dados->>'mensagem_whatsapp', coalesce((p_dados->>'dias_parado')::int, 7), p_dados->>'comercial_canal', p_quem, p_quem)
  returning * into c;
  return to_jsonb(c);
end $$;

-- ---------------------------------------------------- salvar playbook --
create or replace function public.painel_mkt_salvar_playbook(p_id uuid, p_dados jsonb, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.painel_mkt_playbook; canal uuid := (p_dados->>'canal_id')::uuid; achou boolean := false;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if p_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('painel:mkt:playbook:' || p_id::text, 0));
    select * into i from public.painel_mkt_playbook where id = p_id for update;
    achou := found;
  end if;
  if p_id is not null and p_versao is null and achou then
    if i.criado_por is distinct from p_quem then raise exception 'Item do playbook não encontrado' using errcode = 'P0002'; end if;
    return to_jsonb(i);
  end if;
  if not exists (select 1 from public.painel_mkt_canais where id = canal) then
    raise exception 'Canal não encontrado' using errcode = 'P0002';
  end if;
  if p_id is not null and p_versao is not null then
    if not achou then raise exception 'Item do playbook não encontrado' using errcode = 'P0002'; end if;
    if p_versao is distinct from i.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
    -- Código e conclusão não mudam por aqui (código é da carga padrão;
    -- conclusão é a painel_mkt_concluir_playbook). Item que deixou de ser
    -- ação única perde a conclusão: rotina não se conclui de uma vez.
    update public.painel_mkt_playbook set
      canal_id = canal, tipo = p_dados->>'tipo', titulo = p_dados->>'titulo', instrucao = p_dados->>'instrucao',
      responsavel_id = p_dados->>'responsavel_id', recorrencia = p_dados->>'recorrencia',
      a_cada_dias = (p_dados->>'a_cada_dias')::int, meta_quantidade = (p_dados->>'meta_quantidade')::int,
      prazo_dias = (p_dados->>'prazo_dias')::int, prioridade = coalesce(p_dados->>'prioridade', 'media'),
      checklist = coalesce(p_dados->'checklist', '[]'::jsonb), evidencia = coalesce(p_dados->>'evidencia', 'nenhuma'),
      gatilho = p_dados->>'gatilho', implantacao = coalesce((p_dados->>'implantacao')::boolean, false),
      ativo = coalesce((p_dados->>'ativo')::boolean, true), ordem = coalesce((p_dados->>'ordem')::int, 0),
      concluido_em = case when p_dados->>'tipo' = 'unica' then i.concluido_em end,
      concluido_por = case when p_dados->>'tipo' = 'unica' then i.concluido_por end,
      evidencia_valor = case when p_dados->>'tipo' = 'unica' then i.evidencia_valor end,
      versao = i.versao + 1, atualizado_em = now(), atualizado_por = p_quem
    where id = p_id returning * into i;
    return to_jsonb(i);
  end if;
  if p_id is null and p_versao is not null then raise exception 'Item do playbook não encontrado' using errcode = 'P0002'; end if;
  insert into public.painel_mkt_playbook (id, canal_id, tipo, titulo, instrucao, responsavel_id, recorrencia, a_cada_dias, meta_quantidade,
                                         prazo_dias, prioridade, checklist, evidencia, gatilho, implantacao, ativo, ordem, criado_por, atualizado_por)
  values (coalesce(p_id, gen_random_uuid()), canal, p_dados->>'tipo', p_dados->>'titulo', p_dados->>'instrucao', p_dados->>'responsavel_id',
          p_dados->>'recorrencia', (p_dados->>'a_cada_dias')::int, (p_dados->>'meta_quantidade')::int, (p_dados->>'prazo_dias')::int,
          coalesce(p_dados->>'prioridade', 'media'), coalesce(p_dados->'checklist', '[]'::jsonb), coalesce(p_dados->>'evidencia', 'nenhuma'),
          p_dados->>'gatilho', coalesce((p_dados->>'implantacao')::boolean, false), coalesce((p_dados->>'ativo')::boolean, true),
          coalesce((p_dados->>'ordem')::int, 0), p_quem, p_quem)
  returning * into i;
  return to_jsonb(i);
end $$;

-- Retirar o item do playbook: ativo=false. Nada é apagado; salvar de novo
-- com ativo=true traz de volta.
create or replace function public.painel_mkt_retirar_playbook(p_id uuid, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.painel_mkt_playbook;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  select * into i from public.painel_mkt_playbook where id = p_id for update;
  if not found or not i.ativo then raise exception 'Item do playbook não encontrado' using errcode = 'P0002'; end if;
  if p_versao is distinct from i.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
  update public.painel_mkt_playbook set ativo = false, versao = i.versao + 1, atualizado_em = now(), atualizado_por = p_quem
   where id = p_id returning * into i;
  return to_jsonb(i);
end $$;

-- Marcar ou desmarcar um item único (ou de implantação) como feito. A
-- evidência pedida pelo item (link ou texto) é conferida aqui também: a
-- regra não pode depender de a tela lembrar dela.
create or replace function public.painel_mkt_concluir_playbook(p_id uuid, p_versao integer, p_feito boolean, p_evidencia text, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.painel_mkt_playbook; feito boolean := coalesce(p_feito, false); ev text := nullif(btrim(coalesce(p_evidencia, '')), '');
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  select * into i from public.painel_mkt_playbook where id = p_id for update;
  if not found or not i.ativo then raise exception 'Item do playbook não encontrado' using errcode = 'P0002'; end if;
  if p_versao is distinct from i.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
  if i.tipo <> 'unica' then
    raise exception 'Só ação única se conclui por aqui. Rotina e gatilho entram na agenda.' using errcode = '22023';
  end if;
  if feito and i.evidencia in ('link', 'texto') and ev is null then
    raise exception 'Informe a evidência para concluir este item.' using errcode = '22023';
  end if;
  update public.painel_mkt_playbook set
    concluido_em = case when feito then now() end, concluido_por = case when feito then p_quem end,
    evidencia_valor = case when feito then left(ev, 1000) end,
    versao = i.versao + 1, atualizado_em = now(), atualizado_por = p_quem
  where id = p_id returning * into i;
  return to_jsonb(i);
end $$;

-- ------------------------------------------------- salvar publicação --
create or replace function public.painel_mkt_salvar_publicacao(p_id uuid, p_dados jsonb, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.painel_mkt_publicacoes; canal uuid := (p_dados->>'canal_id')::uuid; acao uuid := (p_dados->>'acao_id')::uuid;
        achou boolean := false; mudou boolean;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if p_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('painel:mkt:publicacao:' || p_id::text, 0));
    select * into u from public.painel_mkt_publicacoes where id = p_id for update;
    achou := found;
  end if;
  if p_id is not null and p_versao is null and achou then
    if u.criado_por is distinct from p_quem or u.retirada_em is not null then
      raise exception 'Publicação não encontrada' using errcode = 'P0002';
    end if;
    return to_jsonb(u);
  end if;
  if not exists (select 1 from public.painel_mkt_canais where id = canal) then
    raise exception 'Canal não encontrado' using errcode = 'P0002';
  end if;
  if acao is not null and not exists (select 1 from public.painel_mkt_acoes where id = acao) then
    raise exception 'Ação não encontrada' using errcode = 'P0002';
  end if;
  if p_id is not null and p_versao is not null then
    if not achou or u.retirada_em is not null then raise exception 'Publicação não encontrada' using errcode = 'P0002'; end if;
    if p_versao is distinct from u.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
    -- Fonte e data dos números mudam só quando um número muda: corrigir o
    -- título não pode fingir que os números foram medidos agora.
    mudou := (u.alcance, u.impressoes, u.engajamento, u.cliques, u.leads) is distinct from
             ((p_dados->>'alcance')::int, (p_dados->>'impressoes')::int, (p_dados->>'engajamento')::int,
              (p_dados->>'cliques')::int, (p_dados->>'leads')::int);
    update public.painel_mkt_publicacoes set
      canal_id = canal, data = (p_dados->>'data')::date, titulo = p_dados->>'titulo', url = p_dados->>'url', acao_id = acao,
      alcance = (p_dados->>'alcance')::int, impressoes = (p_dados->>'impressoes')::int, engajamento = (p_dados->>'engajamento')::int,
      cliques = (p_dados->>'cliques')::int, leads = (p_dados->>'leads')::int,
      fonte = case when mudou then coalesce(p_dados->>'fonte', 'manual') else u.fonte end,
      coletado_em = case when mudou then now() else u.coletado_em end,
      versao = u.versao + 1, atualizado_em = now(), atualizado_por = p_quem
    where id = p_id returning * into u;
    return to_jsonb(u);
  end if;
  if p_id is null and p_versao is not null then raise exception 'Publicação não encontrada' using errcode = 'P0002'; end if;
  -- O mesmo link já lançado e depois retirado: a linha volta (com os dados
  -- novos) em vez de o unique (canal, link) barrar para sempre quem retirou
  -- por engano. Link ainda ativo continua dando 23505 ("já foi lançada").
  if p_dados->>'url' is not null then
    select * into u from public.painel_mkt_publicacoes
     where canal_id = canal and url = p_dados->>'url' and retirada_em is not null for update;
    if found then
      update public.painel_mkt_publicacoes set
        data = (p_dados->>'data')::date, titulo = p_dados->>'titulo', acao_id = acao,
        alcance = (p_dados->>'alcance')::int, impressoes = (p_dados->>'impressoes')::int, engajamento = (p_dados->>'engajamento')::int,
        cliques = (p_dados->>'cliques')::int, leads = (p_dados->>'leads')::int,
        fonte = coalesce(p_dados->>'fonte', 'manual'), coletado_em = now(),
        retirada_em = null, retirada_por = null,
        versao = u.versao + 1, atualizado_em = now(), atualizado_por = p_quem
      where id = u.id returning * into u;
      return to_jsonb(u);
    end if;
  end if;
  insert into public.painel_mkt_publicacoes (id, canal_id, data, titulo, url, acao_id, alcance, impressoes, engajamento, cliques, leads,
                                            fonte, criado_por, atualizado_por)
  values (coalesce(p_id, gen_random_uuid()), canal, (p_dados->>'data')::date, p_dados->>'titulo', p_dados->>'url', acao,
          (p_dados->>'alcance')::int, (p_dados->>'impressoes')::int, (p_dados->>'engajamento')::int, (p_dados->>'cliques')::int,
          (p_dados->>'leads')::int, coalesce(p_dados->>'fonte', 'manual'), p_quem, p_quem)
  returning * into u;
  return to_jsonb(u);
end $$;

create or replace function public.painel_mkt_retirar_publicacao(p_id uuid, p_versao integer, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.painel_mkt_publicacoes;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:publicacao:' || p_id::text, 0));
  select * into u from public.painel_mkt_publicacoes where id = p_id for update;
  if not found or u.retirada_em is not null then raise exception 'Publicação não encontrada' using errcode = 'P0002'; end if;
  if p_versao is distinct from u.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
  update public.painel_mkt_publicacoes set retirada_em = now(), retirada_por = p_quem,
    versao = u.versao + 1, atualizado_em = now(), atualizado_por = p_quem
  where id = p_id returning * into u;
  return to_jsonb(u);
end $$;

-- --------------------------------------------- importar publicações (CSV) --
-- Recebe as linhas JÁ conferidas pela Edge Function (prepararLinhaCsv) e
-- grava tudo numa transação: ou entra o arquivo inteiro, ou nada.
--  * linha com link que já existe no canal: atualiza. Número vazio no CSV é
--    "não informado" e mantém o que estava (nunca vira zero);
--  * linha igual ao que já está: não regrava (importar o mesmo arquivo duas
--    vezes não sobe versão nem enche o log) e conta em "iguais";
--  * link de publicação retirada: não volta calado; a linha vai para
--    "retiradas" e a Edge Function explica;
--  * linha sem link: entra sempre.
create or replace function public.painel_mkt_importar_publicacoes(p_linhas jsonb, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l jsonb; u public.painel_mkt_publicacoes; ins int := 0; atu int := 0; iguais int := 0; ret jsonb := '[]';
        canal uuid; novo record; mudou boolean;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if jsonb_typeof(p_linhas) is distinct from 'array' then raise exception 'Linhas inválidas' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:importar', 0));
  for l in select * from jsonb_array_elements(p_linhas) loop
    canal := (l->>'canal_id')::uuid;
    if not exists (select 1 from public.painel_mkt_canais where id = canal) then
      raise exception 'Canal não encontrado' using errcode = 'P0002';
    end if;
    select (l->>'data')::date as data, nullif(l->>'titulo', '') as titulo, (l->>'alcance')::int as alcance,
           (l->>'impressoes')::int as impressoes, (l->>'engajamento')::int as engajamento,
           (l->>'cliques')::int as cliques, (l->>'leads')::int as leads into novo;
    if l->>'url' is not null then
      select * into u from public.painel_mkt_publicacoes where canal_id = canal and url = l->>'url' for update;
      if found then
        if u.retirada_em is not null then
          ret := ret || jsonb_build_array(l->'linha');
          continue;
        end if;
        if (novo.data, coalesce(novo.titulo, u.titulo), coalesce(novo.alcance, u.alcance), coalesce(novo.impressoes, u.impressoes),
            coalesce(novo.engajamento, u.engajamento), coalesce(novo.cliques, u.cliques), coalesce(novo.leads, u.leads))
           is not distinct from (u.data, u.titulo, u.alcance, u.impressoes, u.engajamento, u.cliques, u.leads) then
          iguais := iguais + 1;
          continue;
        end if;
        -- Fonte e data dos números mudam só quando um número muda (a mesma
        -- regra do lançamento à mão): CSV que só corrige o título não pode
        -- dizer "importado do CSV hoje" sobre números digitados em outro dia.
        mudou := (coalesce(novo.alcance, u.alcance), coalesce(novo.impressoes, u.impressoes),
                  coalesce(novo.engajamento, u.engajamento), coalesce(novo.cliques, u.cliques), coalesce(novo.leads, u.leads))
                 is distinct from (u.alcance, u.impressoes, u.engajamento, u.cliques, u.leads);
        update public.painel_mkt_publicacoes set
          data = novo.data, titulo = coalesce(novo.titulo, u.titulo),
          alcance = coalesce(novo.alcance, u.alcance), impressoes = coalesce(novo.impressoes, u.impressoes),
          engajamento = coalesce(novo.engajamento, u.engajamento), cliques = coalesce(novo.cliques, u.cliques),
          leads = coalesce(novo.leads, u.leads),
          fonte = case when mudou then 'csv' else u.fonte end,
          coletado_em = case when mudou then now() else u.coletado_em end,
          versao = u.versao + 1, atualizado_em = now(), atualizado_por = p_quem
        where id = u.id;
        atu := atu + 1;
        continue;
      end if;
    end if;
    insert into public.painel_mkt_publicacoes (canal_id, data, titulo, url, alcance, impressoes, engajamento, cliques, leads, fonte, criado_por, atualizado_por)
    values (canal, novo.data, novo.titulo, l->>'url', novo.alcance, novo.impressoes, novo.engajamento, novo.cliques, novo.leads, 'csv', p_quem, p_quem);
    ins := ins + 1;
  end loop;
  return jsonb_build_object('inseridas', ins, 'atualizadas', atu, 'iguais', iguais, 'retiradas', ret);
end $$;

-- ------------------------------------------------ números da semana --
-- Uma linha por canal e semana. Só os números que vieram no pedido mudam:
-- duas pessoas lançando números diferentes da mesma semana não apagam o
-- número uma da outra. Mandar o número como nulo apaga (era engano).
create or replace function public.painel_mkt_salvar_metricas(p_canal uuid, p_semana date, p_dados jsonb, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.painel_mkt_metricas_canal;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if not exists (select 1 from public.painel_mkt_canais where id = p_canal) then
    raise exception 'Canal não encontrado' using errcode = 'P0002';
  end if;
  if p_semana is null or extract(isodow from p_semana) <> 1 then
    raise exception 'A semana começa na segunda-feira.' using errcode = '22023';
  end if;
  insert into public.painel_mkt_metricas_canal as x (canal_id, semana, seguidores, alcance, impressoes, engajamento, cliques, conversas, leads,
                                                      fonte, criado_por, atualizado_por)
  values (p_canal, p_semana, (p_dados->>'seguidores')::int, (p_dados->>'alcance')::int, (p_dados->>'impressoes')::int,
          (p_dados->>'engajamento')::int, (p_dados->>'cliques')::int, (p_dados->>'conversas')::int, (p_dados->>'leads')::int,
          coalesce(p_dados->>'fonte', 'manual'), p_quem, p_quem)
  on conflict (canal_id, semana) do update set
    seguidores = case when p_dados ? 'seguidores' then excluded.seguidores else x.seguidores end,
    alcance = case when p_dados ? 'alcance' then excluded.alcance else x.alcance end,
    impressoes = case when p_dados ? 'impressoes' then excluded.impressoes else x.impressoes end,
    engajamento = case when p_dados ? 'engajamento' then excluded.engajamento else x.engajamento end,
    cliques = case when p_dados ? 'cliques' then excluded.cliques else x.cliques end,
    conversas = case when p_dados ? 'conversas' then excluded.conversas else x.conversas end,
    leads = case when p_dados ? 'leads' then excluded.leads else x.leads end,
    fonte = excluded.fonte, coletado_em = now(),
    versao = x.versao + 1, atualizado_em = now(), atualizado_por = p_quem
  returning * into m;
  return to_jsonb(m);
end $$;

-- ------------------------------------------------------ papel interno --
-- Papel nulo apaga a linha (a pessoa volta ao padrão, "marketing").
create or replace function public.painel_mkt_definir_papel(p_id_pessoa text, p_papel text, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.painel_mkt_papeis;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  if p_papel is null then
    delete from public.painel_mkt_papeis where id_pessoa = p_id_pessoa;
    return 'null'::jsonb;
  end if;
  insert into public.painel_mkt_papeis (id_pessoa, papel, definido_por, definido_em)
  values (p_id_pessoa, p_papel, p_quem, now())
  on conflict (id_pessoa) do update set papel = excluded.papel, definido_por = excluded.definido_por, definido_em = excluded.definido_em
  returning * into r;
  return to_jsonb(r);
end $$;

-- ------------------------------------------------------ carga padrão --
-- Canais e playbook da especificação (o conteúdo mora em
-- supabase/functions/_shared/marketing-padrao.mjs). Pelo código e com
-- "on conflict do nothing": rodar de novo não duplica e nunca sobrescreve
-- o que a casa editou, desativou ou retirou. O item se pendura no canal pelo
-- código, inclusive num canal que a casa criou antes com o mesmo código.
create or replace function public.painel_mkt_carregar_padrao(p_padrao jsonb, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare nc int; ni int;
begin
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform set_config('painel.motivo', 'Carga padrão do Marketing', true);
  if jsonb_typeof(p_padrao->'canais') is distinct from 'array' or jsonb_typeof(p_padrao->'playbook') is distinct from 'array' then
    raise exception 'Carga padrão inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:padrao', 0));
  insert into public.painel_mkt_canais (codigo, nome, grupo, icone, cor, ordem, ativo, em_implantacao, url_perfil, url_gerenciador,
                                       mensagem_whatsapp, dias_parado, comercial_canal, criado_por, atualizado_por)
  select c->>'codigo', c->>'nome', c->>'grupo', c->>'icone', c->>'cor', coalesce((c->>'ordem')::int, 0),
         coalesce((c->>'ativo')::boolean, true), coalesce((c->>'em_implantacao')::boolean, false), c->>'url_perfil', c->>'url_gerenciador',
         c->>'mensagem_whatsapp', coalesce((c->>'dias_parado')::int, 7), c->>'comercial_canal', p_quem, p_quem
    from jsonb_array_elements(p_padrao->'canais') c
  on conflict (codigo) do nothing;
  get diagnostics nc = row_count;
  insert into public.painel_mkt_playbook (canal_id, codigo, tipo, titulo, instrucao, responsavel_id, recorrencia, a_cada_dias, meta_quantidade,
                                         prazo_dias, prioridade, checklist, evidencia, gatilho, implantacao, ativo, ordem, criado_por, atualizado_por)
  select k.id, i->>'codigo', i->>'tipo', i->>'titulo', i->>'instrucao', i->>'responsavel_id', i->>'recorrencia',
         (i->>'a_cada_dias')::int, (i->>'meta_quantidade')::int, (i->>'prazo_dias')::int, coalesce(i->>'prioridade', 'media'),
         coalesce(i->'checklist', '[]'::jsonb), coalesce(i->>'evidencia', 'nenhuma'), i->>'gatilho',
         coalesce((i->>'implantacao')::boolean, false), true, coalesce((i->>'ordem')::int, 0), p_quem, p_quem
    from jsonb_array_elements(p_padrao->'playbook') i
    join public.painel_mkt_canais k on k.codigo = i->>'canal'
  on conflict (codigo) do nothing;
  get diagnostics ni = row_count;
  perform set_config('painel.motivo', '', true);
  return jsonb_build_object('canais', nc, 'itens', ni);
end $$;

-- ------------------------------------------- salvar ação (a1 + canal) --
-- Corpo da a1 (20261010a) com duas coisas novas: a ação ganha canal_id (o
-- canal tem de existir) e responsavel_id (pessoa pelo id_pessoa). O texto
-- antigo (canal_texto, responsavel_texto) continua guardado: na edição, campo
-- que NÃO veio no pedido fica como estava, e por isso uma aba antiga (que
-- manda só os textos) não apaga o canal escolhido numa aba nova, nem a aba
-- nova (que manda só os ids) apaga o texto antigo.
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
  end if;
  if p_dados->>'canal_id' is not null and not exists (select 1 from public.painel_mkt_canais where id = (p_dados->>'canal_id')::uuid) then
    raise exception 'Canal não encontrado' using errcode = 'P0002';
  end if;
  if p_id is not null and p_versao is null then
    insert into public.painel_mkt_acoes (id, nome, objetivo, publico, canal_id, canal_texto, responsavel_id, responsavel_texto, prazo, situacao, investimento, url, criado_por, atualizado_por)
    values (p_id, p_dados->>'nome', p_dados->>'objetivo', p_dados->>'publico', (p_dados->>'canal_id')::uuid, p_dados->>'canal_texto',
            p_dados->>'responsavel_id', p_dados->>'responsavel_texto',
            (p_dados->>'prazo')::date, coalesce(p_dados->>'situacao', 'Ideia'), coalesce((p_dados->>'investimento')::numeric, 0),
            p_dados->>'url', p_quem, p_quem)
    returning * into a;
  elsif p_id is not null then
    if a.id is null or a.retirada_em is not null then raise exception 'Ação não encontrada' using errcode = 'P0002'; end if;
    if p_versao is distinct from a.versao then raise exception 'Conflito de versão' using errcode = '40001'; end if;
    update public.painel_mkt_acoes set
      nome = p_dados->>'nome', objetivo = p_dados->>'objetivo', publico = p_dados->>'publico',
      canal_id = case when p_dados ? 'canal_id' then (p_dados->>'canal_id')::uuid else a.canal_id end,
      canal_texto = case when p_dados ? 'canal_texto' then p_dados->>'canal_texto' else a.canal_texto end,
      responsavel_id = case when p_dados ? 'responsavel_id' then p_dados->>'responsavel_id' else a.responsavel_id end,
      responsavel_texto = case when p_dados ? 'responsavel_texto' then p_dados->>'responsavel_texto' else a.responsavel_texto end,
      prazo = (p_dados->>'prazo')::date, situacao = p_dados->>'situacao',
      investimento = coalesce((p_dados->>'investimento')::numeric, 0), url = p_dados->>'url',
      versao = a.versao + 1, atualizado_em = now(), atualizado_por = p_quem
    where id = p_id returning * into a;
  else
    if p_versao is not null then raise exception 'Ação não encontrada' using errcode = 'P0002'; end if;
    insert into public.painel_mkt_acoes (nome, objetivo, publico, canal_id, canal_texto, responsavel_id, responsavel_texto, prazo, situacao, investimento, url, criado_por, atualizado_por)
    values (p_dados->>'nome', p_dados->>'objetivo', p_dados->>'publico', (p_dados->>'canal_id')::uuid, p_dados->>'canal_texto',
            p_dados->>'responsavel_id', p_dados->>'responsavel_texto',
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

-- ----------------------------------------------------- a cópia (backup) --
-- As oito tabelas num retrato só (uma função SQL de um comando lê tudo no
-- mesmo instante), mais a lista das painel_mkt_* que existem, para o backup
-- reprovar a tabela que ficar fora da cópia.
create or replace function public.painel_mkt_exportar()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tabelas', (select coalesce(jsonb_agg(tablename order by tablename), '[]') from pg_tables where schemaname = 'public' and tablename like 'painel\_mkt\_%'),
    'painel_mkt_canais', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_canais x),
    'painel_mkt_playbook', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_playbook x),
    'painel_mkt_acoes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_acoes x),
    'painel_mkt_orcamento_vinculo', (select coalesce(jsonb_agg(to_jsonb(x) order by x.orcamento_id), '[]') from public.painel_mkt_orcamento_vinculo x),
    'painel_mkt_publicacoes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_publicacoes x),
    'painel_mkt_metricas_canal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.painel_mkt_metricas_canal x),
    'painel_mkt_papeis', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id_pessoa), '[]') from public.painel_mkt_papeis x),
    'painel_mkt_log', (select coalesce(jsonb_agg(to_jsonb(x) order by x.em, x.id), '[]') from public.painel_mkt_log x));
$$;

-- ------------------------------------------------- a volta (restauro) --
-- Corpo da a1 com as tabelas novas. Mesma regra do resto do painel: o que
-- está no arquivo volta, o que nasceu depois fica. Ordem: canais, playbook,
-- ações, vínculos, publicações, números, papéis, log (quem aponta vem depois
-- de para onde aponta).
--
-- CHAVE ÚNICA QUE COLIDE (código do canal ou do item, canal+link,
-- canal+semana) com outra linha de id diferente: a linha do arquivo vence.
--  * canal e item do playbook: a linha que nasceu depois com o mesmo código
--    (um banco novo que recebeu a carga padrão antes da volta, por exemplo)
--    passa a ter o id do arquivo. Com o ON UPDATE CASCADE, as ações,
--    publicações e números que apontavam para ela vão junto, nada se perde,
--    e em seguida os campos do arquivo entram por cima;
--  * publicação e números da semana: a outra linha sai (é a mesma
--    publicação ou a mesma semana, e o arquivo é quem vale).
-- A versão nunca volta para um número que já existiu (greatest + 1, como na
-- a1): uma aba aberta antes da volta não grava por cima sem conflito.
create or replace function public.painel_mkt_restaurar(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k int; quem text; r record;
        acoes jsonb; vinc jsonb; logs jsonb; canais jsonb; playbook jsonb; pubs jsonb; mets jsonb; papeis jsonb;
begin
  if p is null or p = 'null'::jsonb then return 0; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Marketing inválido no backup'; end if;
  acoes := coalesce(p->'painel_mkt_acoes', '[]'); vinc := coalesce(p->'painel_mkt_orcamento_vinculo', '[]'); logs := coalesce(p->'painel_mkt_log', '[]');
  canais := coalesce(p->'painel_mkt_canais', '[]'); playbook := coalesce(p->'painel_mkt_playbook', '[]');
  pubs := coalesce(p->'painel_mkt_publicacoes', '[]'); mets := coalesce(p->'painel_mkt_metricas_canal', '[]'); papeis := coalesce(p->'painel_mkt_papeis', '[]');
  if exists (select 1 from unnest(array[acoes, vinc, logs, canais, playbook, pubs, mets, papeis]) t where jsonb_typeof(t) <> 'array') then
    raise exception 'Tabela do Marketing inválida no backup';
  end if;
  quem := coalesce(p->>'quem', 'backup');
  perform set_config('painel.quem', quem, true);
  perform set_config('painel.motivo', 'Volta do backup', true);

  -- 1. CANAIS
  for r in
    select l.id as perdedor, f.id as vencedor
      from jsonb_populate_recordset(null::public.painel_mkt_canais, canais) f
      join public.painel_mkt_canais l on l.codigo = f.codigo and l.id <> f.id
     where not exists (select 1 from jsonb_populate_recordset(null::public.painel_mkt_canais, canais) g where g.id = l.id)
  loop
    if not exists (select 1 from public.painel_mkt_canais where id = r.vencedor) then
      update public.painel_mkt_canais set id = r.vencedor where id = r.perdedor;
    else
      -- O id do arquivo já existe com outro código. Não acontece com o
      -- código fixo depois de criado; se acontecer, o que apontava para a
      -- outra linha passa para a do arquivo (publicação ou semana repetida
      -- fica com a do arquivo) e a outra sai.
      delete from public.painel_mkt_publicacoes x where x.canal_id = r.perdedor and x.url is not null
         and exists (select 1 from public.painel_mkt_publicacoes y where y.canal_id = r.vencedor and y.url = x.url);
      update public.painel_mkt_publicacoes set canal_id = r.vencedor where canal_id = r.perdedor;
      delete from public.painel_mkt_metricas_canal x where x.canal_id = r.perdedor
         and exists (select 1 from public.painel_mkt_metricas_canal y where y.canal_id = r.vencedor and y.semana = x.semana);
      update public.painel_mkt_metricas_canal set canal_id = r.vencedor where canal_id = r.perdedor;
      update public.painel_mkt_playbook set canal_id = r.vencedor where canal_id = r.perdedor;
      update public.painel_mkt_acoes set canal_id = r.vencedor where canal_id = r.perdedor;
      delete from public.painel_mkt_canais where id = r.perdedor;
    end if;
  end loop;
  insert into public.painel_mkt_canais select * from jsonb_populate_recordset(null::public.painel_mkt_canais, canais)
    on conflict (id) do update set codigo = excluded.codigo, nome = excluded.nome, grupo = excluded.grupo, icone = excluded.icone,
      cor = excluded.cor, ordem = excluded.ordem, ativo = excluded.ativo, em_implantacao = excluded.em_implantacao,
      url_perfil = excluded.url_perfil, url_gerenciador = excluded.url_gerenciador, mensagem_whatsapp = excluded.mensagem_whatsapp,
      dias_parado = excluded.dias_parado, comercial_canal = excluded.comercial_canal,
      versao = greatest(painel_mkt_canais.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(), atualizado_por = quem;
  get diagnostics k = row_count; n := n + k;

  -- 2. PLAYBOOK (item sem o canal, cópia tirada no meio de uma gravação,
  --    fica de fora em vez de derrubar a volta inteira)
  for r in
    select l.id as perdedor, f.id as vencedor
      from jsonb_populate_recordset(null::public.painel_mkt_playbook, playbook) f
      join public.painel_mkt_playbook l on l.codigo = f.codigo and l.id <> f.id
     where not exists (select 1 from jsonb_populate_recordset(null::public.painel_mkt_playbook, playbook) g where g.id = l.id)
  loop
    if not exists (select 1 from public.painel_mkt_playbook where id = r.vencedor) then
      update public.painel_mkt_playbook set id = r.vencedor where id = r.perdedor;
    else
      delete from public.painel_mkt_playbook where id = r.perdedor;
    end if;
  end loop;
  insert into public.painel_mkt_playbook
    select f.* from jsonb_populate_recordset(null::public.painel_mkt_playbook, playbook) f
     where exists (select 1 from public.painel_mkt_canais c where c.id = f.canal_id)
    on conflict (id) do update set canal_id = excluded.canal_id, codigo = excluded.codigo, tipo = excluded.tipo, titulo = excluded.titulo,
      instrucao = excluded.instrucao, responsavel_id = excluded.responsavel_id, recorrencia = excluded.recorrencia,
      a_cada_dias = excluded.a_cada_dias, meta_quantidade = excluded.meta_quantidade, prazo_dias = excluded.prazo_dias,
      prioridade = excluded.prioridade, checklist = excluded.checklist, evidencia = excluded.evidencia, gatilho = excluded.gatilho,
      implantacao = excluded.implantacao, concluido_em = excluded.concluido_em, concluido_por = excluded.concluido_por,
      evidencia_valor = excluded.evidencia_valor, ativo = excluded.ativo, ordem = excluded.ordem,
      versao = greatest(painel_mkt_playbook.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(), atualizado_por = quem;
  get diagnostics k = row_count; n := n + k;

  -- 3. AÇÕES (a1). Canal que não existe (nem no arquivo, nem no banco) vira
  --    nulo, em vez de a ligação abortar a volta.
  acoes := (select coalesce(jsonb_agg(case when x->>'canal_id' is not null
              and not exists (select 1 from public.painel_mkt_canais c where c.id::text = x->>'canal_id')
            then jsonb_set(x, '{canal_id}', 'null') else x end), '[]') from jsonb_array_elements(acoes) x);
  insert into public.painel_mkt_acoes select * from jsonb_populate_recordset(null::public.painel_mkt_acoes, acoes)
    on conflict (id) do update set legado_id = excluded.legado_id, nome = excluded.nome, objetivo = excluded.objetivo,
      publico = excluded.publico, canal_id = excluded.canal_id, canal_texto = excluded.canal_texto,
      responsavel_id = excluded.responsavel_id, responsavel_texto = excluded.responsavel_texto,
      campanha_id = excluded.campanha_id, prazo = excluded.prazo, situacao = excluded.situacao,
      investimento = excluded.investimento, url = excluded.url,
      versao = greatest(painel_mkt_acoes.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(),
      atualizado_por = quem, migrado_em = excluded.migrado_em, retirada_em = excluded.retirada_em,
      retirada_por = excluded.retirada_por, orcamentos_retirados = excluded.orcamentos_retirados;
  get diagnostics k = row_count; n := n + k;

  -- 4. VÍNCULOS (a1, sem mudança). Os orçamentos de cada ação do arquivo
  --    ficam IGUAIS aos do arquivo, e o orçamento que o arquivo dá a uma
  --    ação sai de quem o tem hoje.
  delete from public.painel_mkt_orcamento_vinculo v
   where v.acao_id in (select (x->>'id')::uuid from jsonb_array_elements(acoes) x)
     and not exists (select 1 from jsonb_array_elements(vinc) b where b->>'orcamento_id' = v.orcamento_id and (b->>'acao_id')::uuid = v.acao_id);
  delete from public.painel_mkt_orcamento_vinculo v
   where v.orcamento_id in (select b->>'orcamento_id' from jsonb_array_elements(vinc) b);
  insert into public.painel_mkt_orcamento_vinculo
    select distinct on (b.orcamento_id) b.* from jsonb_populate_recordset(null::public.painel_mkt_orcamento_vinculo, vinc) b
     where exists (select 1 from public.painel_mkt_acoes x where x.id = b.acao_id and x.retirada_em is null)
     order by b.orcamento_id, b.criado_em desc;
  get diagnostics k = row_count; n := n + k;

  -- 5. PUBLICAÇÕES. Ação que não existe vira nulo; publicação sem o canal
  --    fica de fora. O mesmo link no mesmo canal com outro id: a do banco
  --    que não está no arquivo sai; a que está no arquivo (com outro link
  --    lá) solta o link um instante, para a troca não tropeçar na chave.
  pubs := (select coalesce(jsonb_agg(case when x->>'acao_id' is not null
              and not exists (select 1 from public.painel_mkt_acoes a where a.id::text = x->>'acao_id')
            then jsonb_set(x, '{acao_id}', 'null') else x end), '[]') from jsonb_array_elements(pubs) x);
  delete from public.painel_mkt_publicacoes v
   using jsonb_populate_recordset(null::public.painel_mkt_publicacoes, pubs) f
   where v.canal_id = f.canal_id and v.url = f.url and v.id <> f.id
     and not exists (select 1 from jsonb_populate_recordset(null::public.painel_mkt_publicacoes, pubs) g where g.id = v.id);
  update public.painel_mkt_publicacoes v set url = null
    from jsonb_populate_recordset(null::public.painel_mkt_publicacoes, pubs) f
   where v.canal_id = f.canal_id and v.url = f.url and v.id <> f.id;
  insert into public.painel_mkt_publicacoes
    select f.* from jsonb_populate_recordset(null::public.painel_mkt_publicacoes, pubs) f
     where exists (select 1 from public.painel_mkt_canais c where c.id = f.canal_id)
    on conflict (id) do update set canal_id = excluded.canal_id, data = excluded.data, titulo = excluded.titulo, url = excluded.url,
      acao_id = excluded.acao_id, alcance = excluded.alcance, impressoes = excluded.impressoes, engajamento = excluded.engajamento,
      cliques = excluded.cliques, leads = excluded.leads, fonte = excluded.fonte, coletado_em = excluded.coletado_em,
      retirada_em = excluded.retirada_em, retirada_por = excluded.retirada_por,
      versao = greatest(painel_mkt_publicacoes.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(), atualizado_por = quem;
  get diagnostics k = row_count; n := n + k;

  -- 6. NÚMEROS DA SEMANA. A mesma semana do mesmo canal com outro id: a do
  --    arquivo vence.
  delete from public.painel_mkt_metricas_canal v
   using jsonb_populate_recordset(null::public.painel_mkt_metricas_canal, mets) f
   where v.canal_id = f.canal_id and v.semana = f.semana and v.id <> f.id;
  insert into public.painel_mkt_metricas_canal
    select f.* from jsonb_populate_recordset(null::public.painel_mkt_metricas_canal, mets) f
     where exists (select 1 from public.painel_mkt_canais c where c.id = f.canal_id)
    on conflict (id) do update set canal_id = excluded.canal_id, semana = excluded.semana, seguidores = excluded.seguidores,
      alcance = excluded.alcance, impressoes = excluded.impressoes, engajamento = excluded.engajamento, cliques = excluded.cliques,
      conversas = excluded.conversas, leads = excluded.leads, fonte = excluded.fonte, coletado_em = excluded.coletado_em,
      versao = greatest(painel_mkt_metricas_canal.versao, excluded.versao) + 1,
      criado_em = excluded.criado_em, criado_por = excluded.criado_por, atualizado_em = now(), atualizado_por = quem;
  get diagnostics k = row_count; n := n + k;

  -- 7. PAPÉIS
  insert into public.painel_mkt_papeis select * from jsonb_populate_recordset(null::public.painel_mkt_papeis, papeis)
    on conflict (id_pessoa) do update set papel = excluded.papel, definido_por = excluded.definido_por, definido_em = excluded.definido_em;
  get diagnostics k = row_count; n := n + k;

  -- 8. LOG (a1)
  insert into public.painel_mkt_log select * from jsonb_populate_recordset(null::public.painel_mkt_log, logs) on conflict (id) do nothing;
  get diagnostics k = row_count; n := n + k;
  perform set_config('painel.motivo', '', true);
  return n;
end $$;

revoke all on function public.painel_mkt_registrar(), public.painel_mkt_exportar(), public.painel_mkt_restaurar(jsonb),
  public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text),
  public.painel_mkt_salvar_canal(uuid,jsonb,integer,text), public.painel_mkt_salvar_playbook(uuid,jsonb,integer,text),
  public.painel_mkt_retirar_playbook(uuid,integer,text), public.painel_mkt_concluir_playbook(uuid,integer,boolean,text,text),
  public.painel_mkt_salvar_publicacao(uuid,jsonb,integer,text), public.painel_mkt_retirar_publicacao(uuid,integer,text),
  public.painel_mkt_importar_publicacoes(jsonb,text), public.painel_mkt_salvar_metricas(uuid,date,jsonb,text),
  public.painel_mkt_definir_papel(text,text,text), public.painel_mkt_carregar_padrao(jsonb,text)
  from public, anon, authenticated;
grant execute on function public.painel_mkt_exportar(), public.painel_mkt_restaurar(jsonb),
  public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text),
  public.painel_mkt_salvar_canal(uuid,jsonb,integer,text), public.painel_mkt_salvar_playbook(uuid,jsonb,integer,text),
  public.painel_mkt_retirar_playbook(uuid,integer,text), public.painel_mkt_concluir_playbook(uuid,integer,boolean,text,text),
  public.painel_mkt_salvar_publicacao(uuid,jsonb,integer,text), public.painel_mkt_retirar_publicacao(uuid,integer,text),
  public.painel_mkt_importar_publicacoes(jsonb,text), public.painel_mkt_salvar_metricas(uuid,date,jsonb,text),
  public.painel_mkt_definir_papel(text,text,text), public.painel_mkt_carregar_padrao(jsonb,text)
  to service_role;

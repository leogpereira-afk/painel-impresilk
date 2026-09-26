-- ============================================================================
-- UMA SENHA EM TODOS OS SISTEMAS (contrato das senhas, 26/09/2026).
--
-- Duas acoes passam a gravar senha por aqui:
--   (A) a pessoa troca a PROPRIA senha (painel-auth, trocarMinhaSenha);
--   (B) a direcao define a senha de UMA pessoa (painel-acesso, definirSenha).
--
-- O QUE ESTAVA ERRADO, e cada item custou alguma coisa:
--   * a troca propria gravava `equipe_contas where usuario = <nome>`: o `leo`
--     do PCP (o dono com o nome curto) nunca recebia a senha do `leonardo`;
--   * "gerar senha" passava pela equipe-auth, que exige reenviar papel e
--     modulos: quando a tabela de intencao divergia do sistema, trocar a senha
--     promovia, rebaixava ou tirava modulos do Painel;
--   * um sistema por vez, por HTTP, sem desfazer nada: o do meio falhava e a
--     pessoa ficava com senhas diferentes, e a tela dizia `ok: true`;
--   * a marca de senha provisoria so existia por sistema: quem entrava pelo
--     Painel (a porta que a equipe usa) nunca era obrigado a trocar.
--
-- O DESENHO: tudo que mora no banco muda numa transacao so, e SO nas colunas
-- de senha. Update que nao acha a linha e ERRO e desfaz tudo (update de zero
-- linhas nao e sucesso). O Supabase Auth fica fora da transacao; as functions
-- cuidam dele com ordem, compensacao e relatorio honesto.
--
-- TUDO ADITIVO: o que esta no ar hoje continua funcionando depois disto. A
-- `painel_senha_sincronizar` FICA ate o painel-auth novo estar no ar e
-- conferido; sai numa migracao seguinte. Apagar antes derruba a troca de
-- senha de quem esta com a versao antiga publicada.
-- ============================================================================

-- 1) A MARCA DE SENHA PROVISORIA NA PESSOA.
-- E o que a entrada unica e o Painel conseguem ler. `equipe_contas.trocar_senha`
-- continua existindo e valendo no login direto de cada sistema.
alter table public.acesso_conta add column if not exists trocar_senha boolean not null default false;
alter table public.acesso_conta add column if not exists senha_trocada_em timestamptz;

-- 2) A MARCA FICA ANCORADA NO DADO, NAO NO CAMINHO.
-- Toda senha nova passa pela guarda da entrada (acesso_senha_legado), por
-- qualquer porta: a troca feita dentro do Brief pela equipe-auth (origem
-- `propria`) limpa a marca sem mexer na equipe-auth, e o definirSenha/
-- criarPessoa de antes (origem `central`) ja marca no intervalo entre subir
-- esta migracao e publicar as functions novas.
-- Conta de FUNCAO (porta compartilhada) nunca e marcada: obrigar a troca ali
-- faria o primeiro que entrasse escolher uma senha que os outros nao sabem.
-- `update of hash` pega o upsert que substitui a linha de mesma origem; o
-- carimbo `usado_em` da entrada unica nao muda o hash e nao dispara.
create or replace function public.acesso_senha_marcar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.acesso_conta c
     set trocar_senha = (new.origem in ('direcao', 'central') and c.tipo::text <> 'funcao'),
         senha_trocada_em = now()
   where c.id = new.conta_id;
  return null;   -- AFTER: o retorno e ignorado
end;
$fn$;

drop trigger if exists acesso_senha_marcar_na_guarda on public.acesso_senha_legado;
create trigger acesso_senha_marcar_na_guarda
after insert or update of hash on public.acesso_senha_legado
for each row execute function public.acesso_senha_marcar();

-- 3) GRAVAR A SENHA EM TODAS AS LOJAS DO BANCO, NUMA TRANSACAO.
--
-- p_conta      acesso_conta.id; nulo so na troca propria de quem ainda nao foi
--              consolidado (ai so o Painel muda).
-- p_equipe     [{"sistema","usuario"}]: as linhas de equipe_contas, JA
--              resolvidas por id pela function. Nada de papel nem modulo.
-- p_painel     {"usuario"} ou {"usuario","criar":{"nome","permissoes":["*"]}}
--              (criar: so a direcao sem linha propria, na troca dela mesma).
-- p_hash       {"hash","salt","iter"} (PBKDF2 da casa, o mesmo formato de
--              cada tabela).
-- p_temporaria a marca de provisoria nas contas alcancadas e na pessoa.
-- p_origem     'propria' (A) ou 'direcao' (B).
--
-- Devolve {"antes": ...}: o que foi substituido, para a function DESFAZER se
-- a entrada unica recusar depois. Esse retorno fica na memoria da function e
-- nunca vai para a resposta nem para o log (tem hash e sal).
create or replace function public.acesso_senha_gravar(
  p_conta uuid, p_equipe jsonb, p_painel jsonb, p_hash jsonb, p_temporaria boolean, p_origem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash    text := nullif(p_hash->>'hash', '');
  v_salt    text := nullif(p_hash->>'salt', '');
  v_iter    integer;
  v_item    jsonb;
  v_sistema text;
  v_usuario text;
  v_linha   jsonb;
  v_n       integer;
  v_vistos  text[] := '{}';
  v_equipe  jsonb := '[]'::jsonb;
  v_painel  jsonb := null;
  v_legado  jsonb := '[]'::jsonb;
  v_pessoa  jsonb := null;
begin
  begin
    v_iter := (p_hash->>'iter')::integer;
  exception when others then
    v_iter := null;
  end;
  -- O mesmo piso da painel_senha_sincronizar: hash de mentira nao entra.
  if v_hash is null or v_salt is null or coalesce(v_iter, 0) < 100000 then
    raise exception 'hash inválido' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('propria', 'direcao') then
    raise exception 'origem inválida' using errcode = '22023';
  end if;
  if p_temporaria is null then
    raise exception 'falta dizer se a senha é provisória' using errcode = '22023';
  end if;
  if p_equipe is not null and jsonb_typeof(p_equipe) not in ('array', 'null') then
    raise exception 'lista de contas inválida' using errcode = '22023';
  end if;
  if p_painel is not null and jsonb_typeof(p_painel) not in ('object', 'null') then
    raise exception 'conta do Painel inválida' using errcode = '22023';
  end if;
  -- Sem pessoa, so a troca propria de quem nao foi consolidado, e so o Painel.
  if p_conta is null and (p_origem <> 'propria' or jsonb_array_length(coalesce(nullif(p_equipe, 'null'::jsonb), '[]'::jsonb)) > 0) then
    raise exception 'sem a pessoa, só a própria troca no Painel' using errcode = '22023';
  end if;

  -- ---------------------------------------------- Brief, PCP, Compras, POPs, V.O.F.
  for v_item in select value from jsonb_array_elements(coalesce(nullif(p_equipe, 'null'::jsonb), '[]'::jsonb)) loop
    v_sistema := v_item->>'sistema';
    v_usuario := v_item->>'usuario';
    if coalesce(v_sistema, '') = '' or coalesce(v_usuario, '') = '' then
      raise exception 'conta sem sistema ou sem usuário' using errcode = '22023';
    end if;
    -- Painel e RH tem loja propria; os so-leitura nao tem loja nenhuma aqui.
    if v_sistema in ('painel', 'rh', 'central', 'dre', 'bosques', 'domo') then
      raise exception 'o sistema % não recebe senha por aqui', v_sistema using errcode = '22023';
    end if;
    if (v_sistema || '/' || v_usuario) = any(v_vistos) then
      raise exception 'conta repetida: % no %', v_usuario, v_sistema using errcode = '22023';
    end if;
    v_vistos := v_vistos || (v_sistema || '/' || v_usuario);

    select jsonb_build_object('sistema', e.sistema, 'usuario', e.usuario, 'hash', e.hash,
                              'salt', e.salt, 'iter', e.iter, 'trocar_senha', e.trocar_senha)
      into v_linha
      from public.equipe_contas e
     where e.sistema = v_sistema and e.usuario = v_usuario
       for update;
    -- NUNCA CRIA CONTA. Quem nao existe la desfaz a transacao inteira.
    if not found then
      raise exception 'não existe a conta % no %', v_usuario, v_sistema using errcode = 'P0002';
    end if;
    update public.equipe_contas
       set hash = v_hash, salt = v_salt, iter = v_iter,
           trocar_senha = p_temporaria, atualizado_em = now()
     where sistema = v_sistema and usuario = v_usuario;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'a conta % no % não foi gravada', v_usuario, v_sistema using errcode = 'P0002';
    end if;
    v_equipe := v_equipe || jsonb_build_array(v_linha);
  end loop;

  -- ---------------------------------------------------------------- Painel
  if p_painel is not null and jsonb_typeof(p_painel) = 'object' then
    v_usuario := p_painel->>'usuario';
    if coalesce(v_usuario, '') = '' then
      raise exception 'conta do Painel sem usuário' using errcode = '22023';
    end if;
    select jsonb_build_object('usuario', c.usuario, 'hash', c.hash, 'salt', c.salt, 'iter', c.iter)
      into v_linha
      from public.painel_contas c
     where c.usuario = v_usuario
       for update;
    if found then
      -- So a senha. Nome, permissoes e vendedor nao sao tocados.
      update public.painel_contas
         set hash = v_hash, salt = v_salt, iter = v_iter, atualizado_em = now()
       where usuario = v_usuario;
      get diagnostics v_n = row_count;
      if v_n <> 1 then
        raise exception 'a conta % do Painel não foi gravada', v_usuario using errcode = 'P0002';
      end if;
      v_painel := v_linha;
    elsif p_painel ? 'criar' then
      -- A unica conta que nasce aqui: a da direcao, na troca dela mesma, quando
      -- ainda usa a senha inicial do ambiente.
      if p_origem <> 'propria' or coalesce(p_painel->'criar'->'permissoes', 'null'::jsonb) <> '["*"]'::jsonb then
        raise exception 'só a direção, na própria troca, ganha conta no Painel aqui' using errcode = '22023';
      end if;
      insert into public.painel_contas (usuario, nome, permissoes, vendedor_id, hash, salt, iter, atualizado_em)
      values (v_usuario, coalesce(nullif(p_painel->'criar'->>'nome', ''), v_usuario), '["*"]'::jsonb, '',
              v_hash, v_salt, v_iter, now());
      v_painel := jsonb_build_object('usuario', v_usuario, 'criada', true);
    else
      raise exception 'não existe a conta % no Painel', v_usuario using errcode = 'P0002';
    end if;
  end if;

  -- ---------------------------------------- a guarda da entrada e a marca
  if p_conta is not null then
    select jsonb_build_object('trocar_senha', c.trocar_senha, 'senha_trocada_em', c.senha_trocada_em)
      into v_pessoa
      from public.acesso_conta c
     where c.id = p_conta
       for update;
    if not found then
      raise exception 'pessoa não encontrada' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('origem', l.origem, 'hash', l.hash, 'salt', l.salt,
                                                 'iter', l.iter, 'usado_em', l.usado_em)), '[]'::jsonb)
      into v_legado
      from public.acesso_senha_legado l
     where l.conta_id = p_conta;
    -- A guarda vira UMA linha: a nova. Senha antiga guardada "por via das
    -- duvidas" e chave de porta trocada.
    delete from public.acesso_senha_legado where conta_id = p_conta;
    insert into public.acesso_senha_legado (conta_id, origem, hash, salt, iter)
    values (p_conta, p_origem, v_hash, v_salt, v_iter);
    -- O gatilho ja marcou pela origem; aqui a marca fica EXATAMENTE a pedida
    -- (a porta compartilhada recebe senha definitiva mesmo vinda da direcao).
    update public.acesso_conta
       set trocar_senha = p_temporaria, senha_trocada_em = now()
     where id = p_conta;
  end if;

  return jsonb_build_object('antes', jsonb_build_object(
    'equipe', v_equipe, 'painel', v_painel, 'legado', v_legado, 'pessoa', v_pessoa));
end;
$fn$;

-- 4) DESFAZER, quando a entrada unica recusa a senha depois do banco.
-- Cada linha volta ao `antes` SO SE ainda tiver o hash que acabou de ser
-- gravado: se alguem trocou a senha no meio, a troca dele nao e atropelada.
-- Numa transacao.
create or replace function public.acesso_senha_repor(p_conta uuid, p_antes jsonb, p_hash_gravado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item     jsonb;
  v_n        integer;
  v_repostas integer := 0;
  v_puladas  integer := 0;
begin
  if coalesce(p_hash_gravado, '') = '' or p_antes is null or jsonb_typeof(p_antes) <> 'object' then
    raise exception 'pedido de reposição incompleto' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_antes->'equipe', '[]'::jsonb)) loop
    update public.equipe_contas
       set hash = v_item->>'hash', salt = v_item->>'salt', iter = (v_item->>'iter')::integer,
           trocar_senha = coalesce((v_item->>'trocar_senha')::boolean, false), atualizado_em = now()
     where sistema = v_item->>'sistema' and usuario = v_item->>'usuario' and hash = p_hash_gravado;
    get diagnostics v_n = row_count;
    if v_n = 1 then v_repostas := v_repostas + 1; else v_puladas := v_puladas + 1; end if;
  end loop;

  if jsonb_typeof(p_antes->'painel') = 'object' then
    if coalesce((p_antes->'painel'->>'criada')::boolean, false) then
      delete from public.painel_contas
       where usuario = p_antes->'painel'->>'usuario' and hash = p_hash_gravado;
    else
      update public.painel_contas
         set hash = p_antes->'painel'->>'hash', salt = p_antes->'painel'->>'salt',
             iter = (p_antes->'painel'->>'iter')::integer, atualizado_em = now()
       where usuario = p_antes->'painel'->>'usuario' and hash = p_hash_gravado;
    end if;
    get diagnostics v_n = row_count;
    if v_n = 1 then v_repostas := v_repostas + 1; else v_puladas := v_puladas + 1; end if;
  end if;

  if p_conta is not null then
    -- A guarda so volta se ainda for exatamente a que foi gravada (uma linha,
    -- com o hash novo). Outra coisa la dentro e troca de outra pessoa.
    if exists (select 1 from public.acesso_senha_legado where conta_id = p_conta and hash = p_hash_gravado)
       and not exists (select 1 from public.acesso_senha_legado where conta_id = p_conta and hash <> p_hash_gravado) then
      delete from public.acesso_senha_legado where conta_id = p_conta;
      insert into public.acesso_senha_legado (conta_id, origem, hash, salt, iter, usado_em)
      select p_conta, x->>'origem', x->>'hash', x->>'salt', (x->>'iter')::integer,
             nullif(x->>'usado_em', '')::timestamptz
        from jsonb_array_elements(coalesce(p_antes->'legado', '[]'::jsonb)) x;
      -- O gatilho remarcou pela origem de cada linha; a marca volta a exata.
      update public.acesso_conta
         set trocar_senha = coalesce((p_antes->'pessoa'->>'trocar_senha')::boolean, false),
             senha_trocada_em = nullif(p_antes->'pessoa'->>'senha_trocada_em', '')::timestamptz
       where id = p_conta;
      v_repostas := v_repostas + 1;
    else
      v_puladas := v_puladas + 1;
    end if;
  end if;

  return jsonb_build_object('repostas', v_repostas, 'puladas', v_puladas);
end;
$fn$;

-- 5) SO A service_role EXECUTA. Neste projeto, funcao nova nasce com EXECUTE
-- para anon e authenticated (privilegio padrao do Supabase), e a chave anon
-- esta no bundle PUBLICO dos sites: sem o revoke, qualquer pessoa gravaria a
-- senha de qualquer outra pelo PostgREST.
revoke all on function public.acesso_senha_gravar(uuid, jsonb, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.acesso_senha_repor(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.acesso_senha_marcar() from public, anon, authenticated;
grant execute on function public.acesso_senha_gravar(uuid, jsonb, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public.acesso_senha_repor(uuid, jsonb, text) to service_role;

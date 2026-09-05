create or replace function public.cobranca_mexer(
  p_id        text,
  p_quem      text,
  p_quem_nome text,
  p_cliente   text,
  p_chamado_id text,
  p_chamado   jsonb default null   -- null = apaga o chamado
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg   jsonb;
  v_ch    jsonb;
  v_agora timestamptz := now();
begin
  if p_id is null or p_id = '' then
    raise exception 'cobranca_mexer: cliente vazio';
  end if;
  if p_chamado_id is null or p_chamado_id = '' then
    raise exception 'cobranca_mexer: chamado sem id';
  end if;

  -- Serializa também a primeira gravação, quando ainda não existe linha.
  perform pg_advisory_xact_lock(hashtextextended('cobrancas:' || p_id, 0));

  select registro into v_reg
    from painel_registros
   where colecao = 'cobrancas' and id = p_id
     for update;

  v_reg := coalesce(v_reg, jsonb_build_object('cliente', p_cliente, 'criadoEm', to_jsonb(v_agora)));
  v_ch  := coalesce(v_reg -> 'chamados', '{}'::jsonb);

  if p_chamado is null or jsonb_typeof(p_chamado) = 'null' then
    v_ch := v_ch - p_chamado_id;
  elsif jsonb_typeof(p_chamado) = 'object' then
    /* `em`, `quem` e `quemNome` são do SERVIDOR, sempre -- o cliente manda o
       conteúdo, quem carimba autoria é esta função. `criadoEm` do primeiro
       registro é preservado: editar o resumo de uma ligação não muda quando
       ela aconteceu. */
    v_ch := jsonb_set(v_ch, array[p_chamado_id],
      (p_chamado - 'em' - 'quem' - 'quemNome' - 'criadoEm')
      || jsonb_build_object(
           'em', v_agora,
           'quem', p_quem,
           'quemNome', p_quem_nome,
           'criadoEm', coalesce(v_ch -> p_chamado_id -> 'criadoEm', to_jsonb(v_agora))));
  else
    raise exception 'cobranca_mexer: chamado nao e objeto';
  end if;

  v_reg := v_reg || jsonb_build_object('cliente', p_cliente, 'chamados', v_ch);

  -- Uma prioridade explícita permanece mesmo sem chamados.
  if v_ch = '{}'::jsonb and coalesce(v_reg ->> 'prioridade', 'normal') not in ('alta', 'baixa') then
    delete from painel_registros where colecao = 'cobrancas' and id = p_id;
    return '{}'::jsonb;
  end if;

  insert into painel_registros (colecao, id, registro, atualizado_em)
       values ('cobrancas', p_id, v_reg, v_agora)
  on conflict (colecao, id) do update
     set registro = excluded.registro, atualizado_em = excluded.atualizado_em;

  return v_reg;
end;
$$;

revoke all on function public.cobranca_mexer(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cobranca_mexer(text, text, text, text, text, jsonb) to service_role;


create or replace function public.cobranca_priorizar(p_id text, p_cliente text, p_prioridade text, p_quem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb;
  v_agora timestamptz := now();
begin
  if p_id is null or p_id = '' then raise exception 'Cliente vazio'; end if;
  if p_prioridade is null or p_prioridade not in ('alta', 'normal', 'baixa') then raise exception 'Prioridade inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cobrancas:' || p_id, 0));
  select registro into v_reg from painel_registros where colecao = 'cobrancas' and id = p_id for update;
  v_reg := coalesce(v_reg, jsonb_build_object('cliente', p_cliente, 'criadoEm', v_agora, 'chamados', '{}'::jsonb));
  if p_prioridade = 'normal' then
    v_reg := v_reg - 'prioridade' - 'prioridadePor' - 'prioridadeEm';
  else
    v_reg := v_reg || jsonb_build_object('prioridade', p_prioridade, 'prioridadePor', p_quem, 'prioridadeEm', v_agora);
  end if;
  if coalesce(v_reg -> 'chamados', '{}'::jsonb) = '{}'::jsonb and p_prioridade = 'normal' then
    delete from painel_registros where colecao = 'cobrancas' and id = p_id;
    return '{}'::jsonb;
  end if;
  insert into painel_registros (colecao,id,registro,atualizado_em) values ('cobrancas',p_id,v_reg,v_agora)
  on conflict (colecao,id) do update set registro=excluded.registro, atualizado_em=excluded.atualizado_em;
  return v_reg;
end;
$$;
revoke all on function public.cobranca_priorizar(text,text,text,text) from public, anon, authenticated;
grant execute on function public.cobranca_priorizar(text,text,text,text) to service_role;

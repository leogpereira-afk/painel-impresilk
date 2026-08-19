-- O DIÁRIO DE COBRANÇA, por cliente.
--
-- A tela de Contas Atrasadas responde "quem deve". Não respondia "o que eu já
-- tentei" -- e essa é a pergunta que trava a cobrança: ligar de novo sem saber
-- que o cliente prometeu pagar dia 20 é queimar a relação e o tempo.
--
-- Cada registro é um CLIENTE, e dentro dele os chamados: quando, por onde, com
-- quem, o que ficou combinado. O id do registro é o nome normalizado do
-- cliente -- é a única chave que os títulos do ERP carregam.
--
-- ATÔMICO PELO MESMO MOTIVO DA PERMUTA: o `merge` do painel-config lê, calcula
-- e grava em três passos, e perde escrita simultânea. Aqui o estrago seria
-- perder o registro de uma ligação que já aconteceu -- e ninguém liga de novo
-- para conferir se anotou.
--
-- QUEM E QUANDO SÃO DO SERVIDOR. Um diário de cobrança que a própria pessoa
-- carimba não serve para a conversa com o cliente nem para a direção saber
-- quem falou o quê.

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

  /* Cliente sem chamado nenhum não fica no banco ocupando lugar e aparecendo
     em contagem. Apagar o último chamado apaga o registro. */
  if v_ch = '{}'::jsonb then
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

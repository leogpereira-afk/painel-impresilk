-- MEXER NUMA PERMUTA: uma operação só, atômica, que carimba o histórico.
--
-- Substitui a `permuta_mexer_os` de 20260818g, que só sabia aceitar e tirar
-- O.S. A permuta cresceu: além das O.S. aceitas ela tem lançamentos manuais
-- (o que foi consumido ou creditado sem passar por O.S.), anexos (a nota do
-- que compramos do parceiro) e o histórico da operação.
--
-- POR QUE TUDO NUMA FUNÇÃO SÓ, e não uma ação por assunto:
--
-- 1. O HISTÓRICO PRECISA SER VERDADE. Se o cliente mandasse o histórico, ele
--    poderia reescrevê-lo -- e um histórico que a parte interessada escreve
--    não serve para conferir com o parceiro. Aqui quem carimba autor, hora e
--    o QUE MUDOU é o banco, comparando o registro antigo com o pedido. O
--    `historico` que venha no corpo é ignorado.
--
-- 2. UMA MUDANÇA, UM EVENTO. Alterar o crédito e aceitar uma O.S. no mesmo
--    pedido tem que virar duas linhas no histórico e um único estado final.
--    Em ações separadas, uma podia gravar e a outra falhar, deixando o
--    histórico contando uma história que o saldo não confirma.
--
-- 3. NADA PASSA NO MEIO. O `for update` segura a linha. O merge da Edge
--    Function lê-calcula-grava em três passos e perde escrita simultânea --
--    provado contra a produção antes de 20260818g: dois aceites disparados
--    juntos terminaram com um só.
--
-- CONVENÇÃO DOS PATCHES: chave com valor `null` REMOVE; com objeto, grava.
-- Campos não citados ficam como estão.

drop function if exists public.permuta_mexer_os(text, jsonb);

create or replace function public.permuta_mexer(
  p_id         text,
  p_quem       text,
  p_quem_nome  text,
  p_campos     jsonb default '{}'::jsonb,   -- nome, credito, clientes, encerrada
  p_os         jsonb default '{}'::jsonb,   -- {osId: ficha} | {osId: null}
  p_lancamentos jsonb default '{}'::jsonb,  -- {lancId: lanc} | {lancId: null}
  p_anexo      jsonb default null,          -- {chave, nome, mime} ja no bucket
  p_criar      boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg   jsonb;
  v_os    jsonb;
  v_lanc  jsonb;
  v_anx   jsonb;
  v_hist  jsonb;
  v_agora timestamptz := now();
  k       text;
  v       jsonb;
  v_ev    jsonb;
  v_antes numeric;
  v_dep   numeric;
begin
  if p_id is null or p_id = '' then
    raise exception 'permuta_mexer: id vazio';
  end if;

  select registro into v_reg
    from painel_registros
   where colecao = 'permutas' and id = p_id
     for update;

  if v_reg is null then
    -- Só a criação explícita cria. Um aceite de O.S. numa permuta que sumiu
    -- não pode ressuscitá-la com crédito zero e O.S. dentro: isso apareceria
    -- na tela como um saldo negativo vindo do nada.
    if not p_criar then
      return null;
    end if;
    v_reg := jsonb_build_object('criadaEm', to_jsonb(v_agora));
  end if;

  v_os   := coalesce(v_reg -> 'os', '{}'::jsonb);
  v_lanc := coalesce(v_reg -> 'lancamentos', '{}'::jsonb);
  v_anx  := coalesce(v_reg -> 'anexos', '[]'::jsonb);
  v_hist := coalesce(v_reg -> 'historico', '[]'::jsonb);

  -- ---------------------------------------------------------------- campos
  -- `historico`, `os`, `lancamentos` e `anexos` NUNCA vêm por aqui: são
  -- governados pelos parâmetros próprios. Cliente que os mande no corpo tem os
  -- campos descartados -- é o mesmo cuidado que o painel-config tem com o
  -- historico dos compromissos.
  if p_campos is not null and jsonb_typeof(p_campos) = 'object' then
    if p_criar and (p_campos ? 'nome') then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object(
        'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome, 'tipo', 'criou'));
    end if;

    -- Crédito é o número que o parceiro confere. Mudança dele fica registrada
    -- com o de-para: "passou de 12.000,50 para 15.000,00" é o que responde
    -- "por que o saldo mudou" seis meses depois.
    if (p_campos ? 'credito') then
      v_antes := coalesce((v_reg ->> 'credito')::numeric, 0);
      v_dep   := coalesce((p_campos ->> 'credito')::numeric, 0);
      if v_antes is distinct from v_dep and not p_criar then
        v_hist := v_hist || jsonb_build_array(jsonb_build_object(
          'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
          'tipo', 'credito', 'de', v_antes, 'para', v_dep));
      end if;
    end if;

    if (p_campos ? 'encerrada')
       and coalesce((v_reg ->> 'encerrada')::boolean, false)
           is distinct from coalesce((p_campos ->> 'encerrada')::boolean, false) then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object(
        'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
        'tipo', case when coalesce((p_campos ->> 'encerrada')::boolean, false)
                     then 'encerrou' else 'reabriu' end));
    end if;

    v_reg := v_reg || (p_campos - 'historico' - 'os' - 'lancamentos' - 'anexos');
  end if;

  -- ------------------------------------------------------------------ O.S.
  if p_os is not null and jsonb_typeof(p_os) = 'object' then
    for k, v in select key, value from jsonb_each(p_os) loop
      if v is null or jsonb_typeof(v) = 'null' then
        if v_os ? k then
          v_hist := v_hist || jsonb_build_array(jsonb_build_object(
            'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome, 'tipo', 'tirouOS',
            'numero', v_os -> k ->> 'numero', 'valor', (v_os -> k ->> 'valor')::numeric));
        end if;
        v_os := v_os - k;
      elsif jsonb_typeof(v) = 'object' then
        if not (v_os ? k) then
          v_hist := v_hist || jsonb_build_array(jsonb_build_object(
            'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome, 'tipo', 'aceitouOS',
            'numero', v ->> 'numero', 'valor', (v ->> 'valor')::numeric,
            'cliente', v ->> 'cliente'));
        end if;
        v_os := jsonb_set(v_os, array[k], v);
      else
        raise exception 'permuta_mexer: ficha da O.S. % nao e objeto', k;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------- lançamentos
  if p_lancamentos is not null and jsonb_typeof(p_lancamentos) = 'object' then
    for k, v in select key, value from jsonb_each(p_lancamentos) loop
      if v is null or jsonb_typeof(v) = 'null' then
        if v_lanc ? k then
          v_hist := v_hist || jsonb_build_array(jsonb_build_object(
            'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome, 'tipo', 'tirouLanc',
            'descricao', v_lanc -> k ->> 'descricao',
            'valor', (v_lanc -> k ->> 'valor')::numeric));
        end if;
        v_lanc := v_lanc - k;
      elsif jsonb_typeof(v) = 'object' then
        v_hist := v_hist || jsonb_build_array(jsonb_build_object(
          'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
          'tipo', case when v_lanc ? k then 'mudouLanc' else 'lancou' end,
          'descricao', v ->> 'descricao', 'valor', (v ->> 'valor')::numeric,
          'lado', v ->> 'tipo'));
        v_lanc := jsonb_set(v_lanc, array[k], v);
      else
        raise exception 'permuta_mexer: lancamento % nao e objeto', k;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------- anexo
  -- Os bytes já subiram para o bucket (quem faz isso é a Edge Function, que
  -- sabe checar tamanho e tipo). Aqui entra só a referência.
  if p_anexo is not null and jsonb_typeof(p_anexo) = 'object' then
    v_anx := v_anx || jsonb_build_array(
      p_anexo || jsonb_build_object('em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome));
    v_hist := v_hist || jsonb_build_array(jsonb_build_object(
      'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
      'tipo', 'anexou', 'nome', p_anexo ->> 'nome'));
  end if;

  -- Histórico longo demais vira registro gigante que viaja em toda leitura.
  -- Corta pelo começo: o recente é o que se consulta. Mesmo limite dos
  -- compromissos (MAX_HISTORICO em painel-config).
  if jsonb_array_length(v_hist) > 200 then
    v_hist := (select jsonb_agg(e) from (
      select e from jsonb_array_elements(v_hist) with ordinality t(e, i)
       order by i desc limit 200) s(e));
    v_hist := (select jsonb_agg(e) from (
      select e from jsonb_array_elements(v_hist) with ordinality t(e, i)
       order by i desc) s(e));
  end if;

  v_reg := v_reg
        || jsonb_build_object('os', v_os, 'lancamentos', v_lanc,
                              'anexos', v_anx, 'historico', v_hist);

  insert into painel_registros (colecao, id, registro, atualizado_em)
       values ('permutas', p_id, v_reg, v_agora)
  on conflict (colecao, id) do update
     set registro = excluded.registro, atualizado_em = excluded.atualizado_em;

  return v_reg;
end;
$$;

revoke all on function public.permuta_mexer(text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.permuta_mexer(text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;

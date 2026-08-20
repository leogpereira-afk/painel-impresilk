-- A MESMA MAQUINA para permutas E campanhas.
--
-- A campanha segue a premissa da permuta: escolher clientes, aceitar O.S. uma a
-- uma, e ver o total. O que muda e a PERGUNTA -- a permuta responde "quanto
-- sobra do credito", a campanha responde "quanto vendemos para este evento" --
-- e isso e conta na tela, nao gravacao no banco.
--
-- Por isso a funcao passou a receber a COLECAO em vez de ter 'permutas' escrito
-- dentro. Copiar `permuta_mexer` trocando uma palavra teria duplicado a regra
-- inteira: a transacao com `for update`, o historico carimbado pelo servidor,
-- o anexo por lancamento, o corte do historico em 200. Duplicar a regra foi
-- exatamente o que deixou o contas a pagar para tras hoje -- a mesma conta
-- escrita duas vezes, e so uma corrigida.
--
-- `permuta_mexer` continua existindo como CASCA, chamando esta. Assim nada que
-- ja funciona precisa mudar de nome para a campanha nascer.

create or replace function public.troca_mexer(
  p_colecao    text,
  p_id         text,
  p_quem       text,
  p_quem_nome  text,
  p_campos     jsonb default '{}'::jsonb,
  p_os         jsonb default '{}'::jsonb,
  p_lancamentos jsonb default '{}'::jsonb,
  p_anexo      jsonb default null,
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
  v_lid   text;
begin
  if p_id is null or p_id = '' then
    raise exception 'troca_mexer: id vazio';
  end if;

  select registro into v_reg
    from painel_registros
   where colecao = p_colecao and id = p_id
     for update;

  if v_reg is null then
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
  if p_campos is not null and jsonb_typeof(p_campos) = 'object' then
    if p_criar and (p_campos ? 'nome') then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object(
        'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome, 'tipo', 'criou'));
    end if;

    if (p_campos ? 'desde')
       and coalesce(v_reg ->> 'desde', '') is distinct from coalesce(p_campos ->> 'desde', '') then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object(
        'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
        'tipo', 'periodo', 'para', p_campos ->> 'desde'));
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
        raise exception 'troca_mexer: ficha da O.S. % nao e objeto', k;
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
            'valor', (v_lanc -> k ->> 'valor')::numeric,
            'lado', v_lanc -> k ->> 'tipo'));
        end if;
        v_lanc := v_lanc - k;
      elsif jsonb_typeof(v) = 'object' then
        v_hist := v_hist || jsonb_build_array(jsonb_build_object(
          'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
          'tipo', case when v_lanc ? k then 'mudouLanc' else 'lancou' end,
          'descricao', v ->> 'descricao', 'valor', (v ->> 'valor')::numeric,
          'lado', v ->> 'tipo'));
        -- O anexo NAO vem por aqui: quem o poe e o ramo de baixo, depois de os
        -- bytes subirem. Editar o texto de um lancamento nao pode apagar a nota
        -- que ja estava nele.
        v_lanc := jsonb_set(v_lanc, array[k],
          case when v_lanc -> k ? 'anexo'
               then (v - 'anexo') || jsonb_build_object('anexo', v_lanc -> k -> 'anexo')
               else v - 'anexo' end);
      else
        raise exception 'troca_mexer: lancamento % nao e objeto', k;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------- anexo
  if p_anexo is not null and jsonb_typeof(p_anexo) = 'object' then
    v_lid := p_anexo ->> 'lancId';
    if v_lid is not null and v_lanc ? v_lid then
      v_lanc := jsonb_set(v_lanc, array[v_lid, 'anexo'],
        (p_anexo - 'lancId') || jsonb_build_object(
          'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome));
    elsif v_lid is not null then
      -- Lancamento sumiu entre o upload e a gravacao. Recusar em vez de largar
      -- o arquivo na lista solta: quem chamou precisa saber para apagar os
      -- bytes, senao viram lixo que nenhuma tela lista.
      raise exception 'troca_mexer: lancamento % nao existe', v_lid;
    else
      v_anx := v_anx || jsonb_build_array(
        p_anexo || jsonb_build_object('em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome));
    end if;
    v_hist := v_hist || jsonb_build_array(jsonb_build_object(
      'em', v_agora, 'quem', p_quem, 'quemNome', p_quem_nome,
      'tipo', 'anexou', 'nome', p_anexo ->> 'nome'));
  end if;

  if jsonb_array_length(v_hist) > 200 then
    v_hist := (select jsonb_agg(e order by i)
                 from (select e, i from jsonb_array_elements(v_hist)
                       with ordinality t(e, i)
                       order by i desc limit 200) s(e, i));
  end if;

  v_reg := v_reg
        || jsonb_build_object('os', v_os, 'lancamentos', v_lanc,
                              'anexos', v_anx, 'historico', v_hist);

  insert into painel_registros (colecao, id, registro, atualizado_em)
       values (p_colecao, p_id, v_reg, v_agora)
  on conflict (colecao, id) do update
     set registro = excluded.registro, atualizado_em = excluded.atualizado_em;

  return v_reg;
end;
$$;

revoke all on function public.troca_mexer(text, text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.troca_mexer(text, text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;


/* A casca antiga: a tela de Permutas nao precisa saber que a maquina mudou. */
create or replace function public.permuta_mexer(
  p_id         text,
  p_quem       text,
  p_quem_nome  text,
  p_campos     jsonb default '{}'::jsonb,
  p_os         jsonb default '{}'::jsonb,
  p_lancamentos jsonb default '{}'::jsonb,
  p_anexo      jsonb default null,
  p_criar      boolean default false
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.troca_mexer('permutas', p_id, p_quem, p_quem_nome,
                            p_campos, p_os, p_lancamentos, p_anexo, p_criar);
$$;

revoke all on function public.permuta_mexer(text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.permuta_mexer(text, text, text, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;

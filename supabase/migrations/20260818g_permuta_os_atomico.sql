-- ACEITAR UMA O.S. NUMA PERMUTA, SEM CORRIDA.
--
-- O `merge` do painel-config funde no servidor, mas em TRÊS passos: lê o
-- registro, calcula o fundido, grava. Isso resolve o cliente com estado velho
-- (a aba aberta há dez minutos), que era o problema do `pagosPatch`. Não
-- resolve duas chamadas de verdade simultâneas: as duas leem o mesmo registro
-- antes de qualquer uma gravar, e a segunda grava por cima da primeira.
--
-- Provado contra a produção, antes desta migração: dois pedidos disparados
-- juntos, um aceitando a O.S. 111 e outro a 222, terminaram com só a 222 no
-- registro. A 111 sumiu sem erro nenhum -- e numa permuta isso é dinheiro:
-- a O.S. deixa de abater o crédito e o saldo sobe sozinho.
--
-- Aqui os três passos viram UM. A função roda numa transação só e o `for
-- update` segura a linha: a segunda chamada espera a primeira terminar e vê o
-- resultado dela. É o mesmo caminho que as outras regras compartilhadas deste
-- banco tomaram -- quando o certo depende de ninguém passar no meio, quem
-- garante é o banco, não a Edge Function.
--
-- `null` no valor TIRA a O.S. da permuta (é como a tela desmarca).

create or replace function public.permuta_mexer_os(p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg jsonb;
  v_os  jsonb;
  k     text;
  v     jsonb;
begin
  if p_id is null or p_id = '' then
    raise exception 'permuta_mexer_os: id vazio';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'permuta_mexer_os: patch tem que ser objeto';
  end if;

  -- Segura a linha até o fim da transação. Quem chegar junto espera aqui.
  select registro into v_reg
    from painel_registros
   where colecao = 'permutas' and id = p_id
     for update;

  -- Permuta que não existe NÃO é criada por aqui: a tela cria a permuta antes
  -- de aceitar O.S., e criar uma permuta órfã a partir de um clique de aceite
  -- deixaria crédito zerado com O.S. dentro -- saldo negativo do nada.
  if v_reg is null then
    return null;
  end if;

  v_os := coalesce(v_reg -> 'os', '{}'::jsonb);

  for k, v in select key, value from jsonb_each(p_patch) loop
    if v is null or jsonb_typeof(v) = 'null' then
      v_os := v_os - k;
    elsif jsonb_typeof(v) = 'object' then
      v_os := jsonb_set(v_os, array[k], v);
    else
      -- Ficha de O.S. tem que ser objeto. Recusar é melhor que guardar um
      -- número solto que a conta depois leria como zero.
      raise exception 'permuta_mexer_os: ficha da O.S. % nao e objeto', k;
    end if;
  end loop;

  update painel_registros
     set registro = jsonb_set(v_reg, '{os}', v_os),
         atualizado_em = now()
   where colecao = 'permutas' and id = p_id;

  return jsonb_set(v_reg, '{os}', v_os);
end;
$$;

-- Quem chama é a Edge Function, com a chave de serviço, DEPOIS de conferir o
-- módulo da sessão. A chave pública não tem o que fazer com isto: solta, ela
-- deixaria qualquer pessoa mexer no saldo de qualquer permuta.
revoke all on function public.permuta_mexer_os(text, jsonb) from public;
revoke all on function public.permuta_mexer_os(text, jsonb) from anon;
revoke all on function public.permuta_mexer_os(text, jsonb) from authenticated;
grant execute on function public.permuta_mexer_os(text, jsonb) to service_role;

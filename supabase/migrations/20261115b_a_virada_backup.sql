-- Recuperação conservadora do programa na mesma transação do restauro existente.
-- A RPC antiga permanece intacta para cópias anteriores sem A Virada.
create or replace function public.painel_restaurar_com_virada(p_backup jsonb)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  linha jsonb;
  existente public.virada_ciclos%rowtype;
  resultado jsonb;
  quantidade integer := 0;
begin
  if jsonb_typeof(p_backup->'virada_ciclos') is distinct from 'array'
     or jsonb_array_length(p_backup->'virada_ciclos') > 1000 then
    raise exception using errcode='22023', message='Cópia de A Virada inválida.';
  end if;
  -- Serializa com novas gravações e impede restaurar por cima de um ciclo
  -- mais recente enquanto os arquivos são conferidos.
  lock table public.virada_ciclos in share row exclusive mode;
  for linha in select value from jsonb_array_elements(p_backup->'virada_ciclos') loop
    if jsonb_typeof(linha) is distinct from 'object'
      or jsonb_typeof(linha->'ativo') is distinct from 'boolean'
      or jsonb_typeof(linha->'registro') is distinct from 'object'
      or linha->>'id' is distinct from linha->'registro'->>'id'
      or (linha->>'versao')::bigint is distinct from (linha->'registro'->>'versao')::bigint then
      raise exception using errcode='22023', message='Ciclo inválido na cópia.';
    end if;
    select * into existente from public.virada_ciclos where id=(linha->>'id')::uuid for update;
    if found then
      if existente.ativo is distinct from (linha->>'ativo')::boolean
        or existente.versao is distinct from (linha->>'versao')::bigint
        or existente.registro is distinct from linha->'registro' then
        raise exception using errcode='40001', message='Há um ciclo diferente no destino. Preserve a evolução antes de recuperar outra versão.';
      end if;
    else
      insert into public.virada_ciclos(id,ativo,versao,registro,atualizado_em)
        values((linha->>'id')::uuid,(linha->>'ativo')::boolean,(linha->>'versao')::bigint,linha->'registro',coalesce((linha->>'atualizado_em')::timestamptz,now()));
    end if;
    quantidade := quantidade + 1;
  end loop;
  resultado := public.painel_restaurar_atomico(p_backup);
  if resultado->>'verificado' is distinct from 'true' then
    raise exception using errcode='22023', message='A recuperação do Painel não foi confirmada.';
  end if;
  return resultado || jsonb_build_object('viradaCiclos',quantidade);
end;
$$;
revoke all on function public.painel_restaurar_com_virada(jsonb) from public,anon,authenticated;
grant execute on function public.painel_restaurar_com_virada(jsonb) to service_role;

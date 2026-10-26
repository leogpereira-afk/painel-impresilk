-- Reuniões recorrentes e decisão -> demanda. Nenhuma carga de dados.
-- O servidor autoriza cada alvo; esta RPC interna garante uma única transação.
create or replace function public.painel_reunioes_gravar_lote(p_itens jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entrada jsonb; resultado jsonb := '[]'::jsonb; demanda jsonb; reuniao jsonb;
begin
 if jsonb_typeof(p_itens) is distinct from 'array' then
  raise exception using errcode='22023',message='Informe uma lista de registros.';
 end if;
 if jsonb_array_length(p_itens)<1 or jsonb_array_length(p_itens)>104 then
  raise exception using errcode='22023',message='O lote deve conter de 1 a 104 registros.';
 end if;
 for entrada in select value from jsonb_array_elements(p_itens) loop
  if jsonb_typeof(entrada) is distinct from 'object'
   or coalesce(entrada->>'colecao','') not in ('reunioes_empresa','processos_empresa')
   or jsonb_typeof(entrada->'id') is distinct from 'string'
   or coalesce(entrada->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$'
   or jsonb_typeof(entrada->'registro') is distinct from 'object'
   or jsonb_typeof(entrada->'registro'->'id') is distinct from 'string'
   or entrada->'registro'->>'id' is distinct from entrada->>'id'
   or jsonb_typeof(entrada->'registro'->'versao') is distinct from 'string'
   or coalesce(entrada->'registro'->>'versao','')=''
   or not (entrada ? 'anterior')
   or jsonb_typeof(entrada->'anterior') not in ('object','null')
   or (jsonb_typeof(entrada->'anterior')='object' and entrada->'anterior'->>'id' is distinct from entrada->>'id') then
   raise exception using errcode='22023',message='Registro inválido no lote.';
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_itens) e group by e->>'colecao',e->>'id' having count(*)>1) then
  raise exception using errcode='22023',message='O lote contém registros repetidos.';
 end if;
 -- A coleção de processos só entra como nova demanda vinculada à decisão
 -- da única reunião do mesmo lote. Não serve como gravação genérica.
 if exists(select 1 from jsonb_array_elements(p_itens) e where e->>'colecao'='processos_empresa') then
  if jsonb_array_length(p_itens)<>2
   or (select count(*) from jsonb_array_elements(p_itens) e where e->>'colecao'='processos_empresa')<>1 then
   raise exception using errcode='22023',message='Encaminhamento inválido.';
  end if;
  select value into demanda from jsonb_array_elements(p_itens) where value->>'colecao'='processos_empresa';
  select value into reuniao from jsonb_array_elements(p_itens) where value->>'colecao'='reunioes_empresa';
  if demanda->'registro'->>'tipo' is distinct from 'demanda'
   or demanda->'anterior' is distinct from 'null'::jsonb
   or jsonb_typeof(reuniao->'anterior') is distinct from 'object'
   or demanda->'registro'->>'origemReuniaoId' is distinct from reuniao->>'id'
   or not exists(select 1 from jsonb_array_elements(reuniao->'registro'->'decisoes') d
       where d->>'id'=demanda->'registro'->>'origemDecisaoId' and d->>'demandaId'=demanda->>'id') then
   raise exception using errcode='22023',message='Demanda sem vínculo com a decisão.';
  end if;
 end if;
 -- Mesmas chaves da gravação individual; ordem única evita inversão de locks
 -- entre duas edições de série e entre encaminhamentos simultâneos.
 for entrada in select value from jsonb_array_elements(p_itens) order by value->>'colecao',value->>'id' loop
  perform pg_advisory_xact_lock(hashtextextended('painel:'||(entrada->>'colecao')||':'||(entrada->>'id'),0));
 end loop;
 for entrada in select value from jsonb_array_elements(p_itens) order by value->>'colecao',value->>'id' loop
  resultado:=resultado || jsonb_build_array(public.painel_registro_gravar(
   entrada->>'colecao',entrada->>'id',entrada->'registro',nullif(entrada->'anterior','null'::jsonb)));
 end loop;
 return resultado;
end $$;

revoke all on function public.painel_reunioes_gravar_lote(jsonb) from public,anon,authenticated;
grant execute on function public.painel_reunioes_gravar_lote(jsonb) to service_role;

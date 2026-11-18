-- Somente estrutura; nenhuma ação, pessoa ou arquivo real.
-- A ficha canônica usa painel_registros, já incluído no backup/restauro do Painel.
create unique index if not exists planejamento_origem_unica
 on public.painel_registros ((registro #>> '{origem,chave}'))
 where colecao='planejamento_anual' and nullif(registro #>> '{origem,chave}','') is not null;

create or replace function public.painel_planejamento_importar(p_lote_id text,p_hash text,p_itens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entrada jsonb; salvo jsonb; resultado jsonb:='[]'::jsonb; anterior jsonb;
begin
 if p_lote_id is null or p_lote_id !~ '^[a-zA-Z0-9_-]{1,80}$'
  or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_itens) is distinct from 'array' then
  raise exception using errcode='22023',message='Importação inválida.';
 end if;
 if jsonb_array_length(p_itens)<1 or jsonb_array_length(p_itens)>200 then
  raise exception using errcode='22023',message='Selecione de 1 a 200 ações.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('planejamento-importacao:'||p_lote_id,0));
 select registro into anterior from public.painel_registros where colecao='planejamento_importacoes' and id=p_lote_id;
 if found then
  if anterior->>'hash' is distinct from p_hash then
   raise exception using errcode='40001',message='O lote já foi utilizado com outro conteúdo.';
  end if;
  return anterior->'itens';
 end if;
 for entrada in select value from jsonb_array_elements(p_itens) loop
  if jsonb_typeof(entrada) is distinct from 'object'
   or coalesce(entrada->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$'
   or jsonb_typeof(entrada->'registro') is distinct from 'object'
   or entrada->'registro'->>'id' is distinct from entrada->>'id'
   or coalesce(entrada->'registro'->>'versao','') !~ '^[1-9][0-9]*$'
   or jsonb_typeof(entrada->'registro'->'versao') is distinct from 'number'
   or not(entrada ? 'anterior') or jsonb_typeof(entrada->'anterior') not in ('object','null')
   or nullif(entrada->'registro'#>>'{origem,chave}','') is null
   or jsonb_typeof(entrada->'registro'->'historico') is distinct from 'array'
   or jsonb_typeof(entrada->'registro'->'anexos') is distinct from 'array'
   or (jsonb_typeof(entrada->'anterior')='object' and entrada->'anterior'->>'id' is distinct from entrada->>'id') then
   raise exception using errcode='22023',message='Ação inválida na importação.';
  end if;
  if (entrada->'registro'->>'versao')::bigint <> coalesce((entrada->'anterior'->>'versao')::bigint,0)+1 then
   raise exception using errcode='22023',message='Versão inválida na importação.';
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_itens) e group by e->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_itens) e group by e->'registro'#>>'{origem,chave}' having count(*)>1) then
  raise exception using errcode='22023',message='Ações repetidas na importação.';
 end if;
 for entrada in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
  perform pg_advisory_xact_lock(hashtextextended('painel:planejamento_anual:'||(entrada->>'id'),0));
 end loop;
 for entrada in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
  salvo:=public.painel_registro_gravar('planejamento_anual',entrada->>'id',entrada->'registro',nullif(entrada->'anterior','null'::jsonb));
  resultado:=resultado||jsonb_build_array(salvo);
 end loop;
 perform public.painel_registro_gravar('planejamento_importacoes',p_lote_id,jsonb_build_object('hash',p_hash,'itens',resultado,'em',now()),null);
 return resultado;
end $$;
revoke all on function public.painel_planejamento_importar(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.painel_planejamento_importar(text,text,jsonb) to service_role;

-- Só a porta autenticada emite URL assinada; policies legadas amplas não podem
-- abrir estes arquivos a clientes diretos. Os demais prefixos ficam inalterados.
drop policy if exists planejamento_arquivos_somente_servidor on storage.objects;
create policy planejamento_arquivos_somente_servidor on storage.objects
 as restrictive for all to anon,authenticated
 using (bucket_id<>'painel-arquivos' or name not like 'planejamento/%')
 with check (bucket_id<>'painel-arquivos' or name not like 'planejamento/%');

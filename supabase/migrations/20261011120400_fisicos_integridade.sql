-- Relações por IDs explícitos; legado inalterado continua editável, sem inferência.
create or replace function public.painel_fisico_conferir_referencias()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; anterior jsonb; ref text; campo text;
begin
 if not ((TG_OP<>'DELETE' and NEW.colecao='ativo') or (TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores'))) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 if TG_OP<>'DELETE' and NEW.colecao='ativo' then
  select registro into v from public.painel_registros where colecao='ativo' and id=NEW.id;
  if TG_OP='UPDATE' and OLD.colecao='ativo' then anterior:=OLD.registro; end if;
  foreach campo in array array['setorId','gravadorId'] loop
   ref:=v #>> array['especificacao',campo];
   if coalesce(ref,'')<>'' and (TG_OP='INSERT' or ref is distinct from (anterior #>> array['especificacao',campo])) then
    if not exists(select 1 from public.painel_registros where id=ref and
      ((campo='setorId' and colecao='setores') or
       (campo='gravadorId' and colecao='ativo' and registro->>'tipo'='seguranca' and registro->>'categoria'='DVR/NVR'
        and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado'))) then
      raise exception using errcode='23503',message='Selecione um setor ou gravador ativo cadastrado; confira ou desvincule a referência anterior.';
    end if;
   end if;
  end loop;
 end if;
 if TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores') then
  campo:=case when OLD.colecao='setores' then 'setorId' else 'gravadorId' end;
  if exists(select 1 from public.painel_registros where colecao='ativo' and registro #>> array['especificacao',campo]=OLD.id)
   and not exists(select 1 from public.painel_registros where colecao=OLD.colecao and id=OLD.id and
     (OLD.colecao='setores' or (registro->>'tipo'='seguranca' and registro->>'categoria'='DVR/NVR'
      and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado'))) then
    raise exception using errcode='23503',message='Troque ou desvincule o setor ou gravador nas fichas relacionadas antes de retirar, baixar ou alterar.';
  end if;
 end if;
 return null;
end $$;
revoke all on function public.painel_fisico_conferir_referencias() from public,anon,authenticated;
drop trigger if exists painel_fisico_referencias_integras on public.painel_registros;
create constraint trigger painel_fisico_referencias_integras after insert or update or delete
 on public.painel_registros deferrable initially deferred for each row
 execute function public.painel_fisico_conferir_referencias();

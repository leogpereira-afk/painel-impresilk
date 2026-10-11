-- Uma ficha física de telefone/celular só pode estar em uma linha.
create unique index if not exists painel_linha_aparelho_unico
on public.painel_registros ((registro->>'aparelhoId'))
where colecao='patrimonio_controles' and registro->>'tipo' in ('ramais','celulares')
 and coalesce(registro->>'aparelhoId','')<>'';

-- Também protege gravações por RPC, restauração e exclusão direta.
create or replace function public.painel_ramal_conferir_vinculos()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; campo text; destino text; ref text; anterior jsonb; tipo text;
begin
 if not ((TG_OP<>'DELETE' and NEW.colecao='patrimonio_controles' and NEW.registro->>'tipo' in ('ramais','celulares'))
   or (TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores'))) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 if TG_OP<>'DELETE' and NEW.colecao='patrimonio_controles' and NEW.registro->>'tipo' in ('ramais','celulares') then
  select registro into v from public.painel_registros where colecao=NEW.colecao and id=NEW.id;
  if v is null then return null; end if;
  tipo:=v->>'tipo';
  if TG_OP='UPDATE' then anterior:=OLD.registro; end if;
  foreach campo in array array['setorId','aparelhoId'] loop
   if campo='setorId' and tipo='celulares' then continue; end if;
   ref:=v->>campo;
   destino:=case when campo='setorId' then 'setores' else 'ativo' end;
   if coalesce(ref,'')<>'' and (TG_OP='INSERT' or (anterior->>campo) is distinct from ref) then
    if not exists(select 1 from public.painel_registros where colecao=destino and id=ref
      and (campo='setorId' or (registro->>'tipo'='informatica' and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado' and registro->>'categoria'=case when tipo='ramais' then 'Telefone' else 'Celular' end))) then
      raise exception using errcode='23503',message='Vínculo da linha inválido: selecione setor ou aparelho cadastrado.';
    end if;
   end if;
  end loop;
 end if;
 if TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores') then
  campo:=case when OLD.colecao='setores' then 'setorId' else 'aparelhoId' end;
  if exists(select 1 from public.painel_registros where colecao='patrimonio_controles'
     and registro->>'tipo' in ('ramais','celulares') and registro->>campo=OLD.id)
   and not exists(select 1 from public.painel_registros where colecao=OLD.colecao and id=OLD.id
     and (OLD.colecao='setores' or (registro->>'tipo'='informatica' and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado' and registro->>'categoria'=case
      when exists(select 1 from public.painel_registros where colecao='patrimonio_controles' and registro->>'tipo'='celulares' and registro->>'aparelhoId'=OLD.id) then 'Celular' else 'Telefone' end))) then
    raise exception using errcode='23503',message='Desvincule a linha antes de retirar ou alterar o aparelho.';
  end if;
 end if;
 return null;
end $$;
revoke all on function public.painel_ramal_conferir_vinculos() from public,anon,authenticated;

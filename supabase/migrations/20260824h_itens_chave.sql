-- A CHAVE NORMALIZADA DO ITEM PASSA A MORAR NO PROPRIO ITEM.
--
-- As funcoes da analise normalizavam produto+modelo (upper + unaccent +
-- espacos) em TODA chamada, para TODOS os 43 mil itens: o detalhe de um
-- produto custava 1,45s e o panorama sem recorte 1,74s. A chave agora e
-- gravada no jsonb do item (campo `k`) por TRIGGER -- o unico lugar por onde
-- toda escrita passa: a carga, o backfill e a restauracao de backup ganham a
-- chave sem saber dela. Regua UNICA, no banco: calcular a mesma chave em JS
-- na carga abriria a porta para as duas divergirem num acento.
create or replace function public.painel_ordens_chavear_itens()
returns trigger
language plpgsql
as $$
declare
  novo jsonb := '[]'::jsonb;
  i    jsonb;
begin
  if new.itens is null or jsonb_typeof(new.itens) <> 'array' or new.itens = '[]'::jsonb then
    return new;
  end if;
  for i in select * from jsonb_array_elements(new.itens) loop
    if coalesce(i->>'produto', '') <> '' then
      i := i || jsonb_build_object('k',
        upper(public.unaccent_simples(trim(regexp_replace(coalesce(i->>'produto',''), '\s+', ' ', 'g')))) || '|' ||
        upper(public.unaccent_simples(trim(regexp_replace(coalesce(nullif(trim(i->>'modelo'),''), i->>'produto'), '\s+', ' ', 'g')))));
    end if;
    novo := novo || jsonb_build_array(i);
  end loop;
  new.itens := novo;
  return new;
end;
$$;

drop trigger if exists painel_ordens_chavear_itens on public.painel_ordens;
create trigger painel_ordens_chavear_itens
  before insert or update of itens on public.painel_ordens
  for each row execute function public.painel_ordens_chavear_itens();

-- Backfill: passa cada linha pelo proprio trigger (update de itens dispara).
update public.painel_ordens set itens = itens
 where itens is not null and jsonb_typeof(itens) = 'array' and itens <> '[]'::jsonb;

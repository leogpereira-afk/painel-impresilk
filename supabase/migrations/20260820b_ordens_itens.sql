-- OS ITENS DA O.S. NA TABELA, para o ranking de produtos das campanhas.
--
-- A tabela nasceu com o comentário "Sem itens: o total basta" -- e bastava,
-- porque quem a usava era a permuta, que só pergunta quanto abateu. A campanha
-- pergunta outra coisa: "o que a gente VENDE nesse tipo de evento". Placa? Lona?
-- Adesivo? É a resposta que decide o que estocar e quem escalar na próxima
-- eleição, e ela mora no item, não no cabeçalho.
--
-- POR QUE AQUI E NÃO NO painel_cache: o cache das O.S. vai de 2025 em diante,
-- porque viaja INTEIRO para o navegador no login. O histórico desde 2020 são
-- ~20.800 O.S., e a campanha de 2022 precisa dos itens dela. Nesta tabela o
-- dado desce filtrado, só das O.S. que a campanha marcou -- dezenas, não
-- milhares.
--
-- POR QUE jsonb E NÃO UMA TABELA DE ITENS: ninguém vai consultar item solto.
-- A pergunta é sempre "os itens DESTAS O.S.", e a resposta viaja junto com a
-- linha. Uma tabela filha custaria um join e uma migração de 60 mil linhas para
-- responder o que um campo responde.
alter table public.painel_ordens
  add column if not exists itens jsonb not null default '[]'::jsonb;

comment on column public.painel_ordens.itens is
  'Itens normalizados da O.S. (produto, categoria, modelo, quantidade, valorUnit, valorTotal), incluindo os de uniao ja rateados. Vazio = a carga ainda nao passou por esta O.S.; a tela precisa distinguir isso de "O.S. sem item".';

-- QUANTAS JÁ TÊM ITEM. A tela de campanhas usa isto para não apresentar um
-- ranking vazio como se fosse "não vendeu produto nenhum" -- medição que dá
-- zero pode ser "não cheguei lá", e já reportei o sistema mais leve da casa
-- como o mais pesado por não ter distinguido as duas coisas.
create or replace function public.ordens_cobertura_itens()
returns table (com_itens bigint, total bigint, desde date, ate date)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where jsonb_array_length(itens) > 0),
    count(*),
    min(data) filter (where jsonb_array_length(itens) > 0),
    max(data) filter (where jsonb_array_length(itens) > 0)
  from public.painel_ordens;
$$;

revoke all on function public.ordens_cobertura_itens() from public, anon, authenticated;
grant execute on function public.ordens_cobertura_itens() to service_role;

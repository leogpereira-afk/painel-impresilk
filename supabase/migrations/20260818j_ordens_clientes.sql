-- A LISTA DE CLIENTES DA BUSCA DA PERMUTA, agrupada no banco.
--
-- A tela precisa de "quais clientes casam com o que eu digitei, e quanto cada
-- um já comprou". Fazer isso no cliente obrigaria a baixar a carteira inteira
-- de cada nome que casa -- digitar "a" traria as ~19.500 O.S. Agrupado aqui,
-- descem no máximo 30 linhas.
--
-- O termo é normalizado do mesmo jeito que `cliente_chave` foi gravado (sem
-- acento, maiúsculo) -- ver o comentário de 20260818h_painel_ordens.sql e a
-- `chaveCliente` de src/lib/calc/permutas.js. As três normalizações têm de
-- concordar; a do banco é a que decide, porque é ela que compara.

-- Normalização sem depender da extensão `unaccent` (que exigiria superusuário
-- e um índice de expressão). É a mesma tabela de letras que o normalizador da
-- carga usa antes de gravar `cliente_chave`.
create or replace function public.unaccent_simples(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(
    coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;

create or replace function public.painel_ordens_clientes(
  p_termo text,
  p_desde date default null
)
returns table (
  chave  text,
  nome   text,
  qtd    bigint,
  total  numeric,
  ultima date,
  cnpjs  text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.cliente_chave                                as chave,
    -- O nome mais recente ganha: a razão social muda, e mostrar a antiga
    -- confunde quem procura pelo que vê hoje na nota.
    (array_agg(o.cliente order by o.data desc nulls last))[1] as nome,
    count(*)                                       as qtd,
    sum(o.valor)                                   as total,
    max(o.data)                                    as ultima,
    coalesce(array_agg(distinct o.cnpj) filter (where o.cnpj <> ''), '{}') as cnpjs
    from painel_ordens o
   where o.cliente_chave like '%' || upper(unaccent_simples(p_termo)) || '%'
     and (p_desde is null or o.data >= p_desde)
   group by o.cliente_chave
   order by max(o.data) desc nulls last
   limit 30;
$$;

revoke all on function public.painel_ordens_clientes(text, date) from public, anon, authenticated;
grant execute on function public.painel_ordens_clientes(text, date) to service_role;

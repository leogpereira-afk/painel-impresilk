-- A BUSCA DE CLIENTE PASSA A RESPEITAR O FIM DO PERÍODO.
--
-- A campanha tem começo E fim (uma eleição acaba em outubro). A lista de O.S.
-- já é cortada dos dois lados, mas a BUSCA DE CLIENTE só olhava o começo: ao
-- procurar um candidato, o "12 O.S. · R$ 84.000" que aparece ao lado do nome
-- contava também o que ele comprou depois do evento. Duas réguas para o mesmo
-- período, na mesma tela, é sempre um número que não fecha com o outro.
--
-- O CORPO É O MESMO, LINHA POR LINHA. Só entra `p_ate`. A primeira versão que
-- escrevi reescrevia a função inteira de cabeça e teria trocado, em silêncio:
-- a ordenação (é por data, não por valor), a escolha do nome (o mais RECENTE
-- ganha, porque a razão social muda), o `unaccent_simples` por um `translate`
-- meu, e a ordem das colunas do retorno. Nada disso teria dado erro -- teria
-- só passado a devolver outra coisa.
--
-- DROP antes do CREATE porque um parâmetro novo COM default cria sobrecarga:
-- as duas assinaturas casariam com uma chamada de dois argumentos e o Postgres
-- recusaria por ambiguidade. Entre o drop e o create a função não existe, mas
-- são milissegundos na mesma transação -- e a chamada antiga (dois argumentos
-- nomeados) continua valendo depois, pelo default.
drop function if exists public.painel_ordens_clientes(text, date);

create or replace function public.painel_ordens_clientes(
  p_termo text,
  p_desde date default null,
  p_ate   date default null
)
returns table(chave text, nome text, qtd bigint, total numeric, ultima date, cnpjs text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
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
     and (p_ate   is null or o.data <= p_ate)
   group by o.cliente_chave
   order by max(o.data) desc nulls last
   limit 30;
$function$;

revoke all on function public.painel_ordens_clientes(text, date, date) from public, anon, authenticated;
grant execute on function public.painel_ordens_clientes(text, date, date) to service_role;

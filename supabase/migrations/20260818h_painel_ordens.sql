-- AS ORDENS DE SERVIÇO VIRAM TABELA, para a busca da permuta alcançar 2020.
--
-- POR QUE NÃO NO CACHE QUE JÁ EXISTE: o `painel_cache.ordens` é UMA linha com
-- um vetor JSON, e ela viaja INTEIRA para o navegador em todo login. Hoje são
-- 4.862 O.S. desde 2025-01-02, 2,6 MB. Puxar desde 2020 dá ~19.500 O.S. e
-- ~10 MB -- o painel abre hoje com 85 kB, e isso o multiplicaria por cem para
-- todo mundo, por causa de uma tela que só a direção usa.
--
-- Aqui a O.S. é LINHA, com índice por cliente. A permuta pergunta por um
-- cliente e desce só o que é dele (dezenas de linhas, não vinte mil).
--
-- NÃO GUARDA OS ITENS, de propósito. A permuta só precisa do total da O.S.;
-- os itens são o que faz o cache pesar, e quem precisa deles (produtos,
-- faturamento por categoria) continua lendo o `painel_cache.ordens`. Duas
-- formas do mesmo dado, cada uma para o que serve -- e a de baixo é derivada
-- da mesma carga, então não existem duas verdades sobre o valor de uma O.S.
--
-- `cliente_chave` é o nome sem acento, sem caixa e sem espaço dobrado: é por
-- ele que a busca casa. Fica GRAVADO em vez de calculado na consulta porque
-- índice sobre expressão com unaccent exigiria a extensão, e porque a mesma
-- normalização precisa valer igual no cliente (chaveCliente em
-- src/lib/calc/permutas.js) -- gravada, ela é uma só.

create table if not exists public.painel_ordens (
  id            text primary key,
  numero        text not null default '',
  cliente       text not null default '',
  cliente_chave text not null default '',
  cnpj          text not null default '',
  data          date,
  valor         numeric(14,2) not null default 0,
  vendedor      text not null default '',
  atualizado_em timestamptz not null default now()
);

create index if not exists painel_ordens_cliente on public.painel_ordens (cliente_chave);
create index if not exists painel_ordens_data    on public.painel_ordens (data desc);
-- Buscar por número da O.S. é o segundo caminho: a direção às vezes já sabe o
-- número e não quer percorrer o cliente inteiro.
create index if not exists painel_ordens_numero  on public.painel_ordens (numero);

-- Ninguém fala com esta tabela pela chave pública. Quem lê é a Edge Function
-- painel-dados, com a chave de serviço, DEPOIS de conferir o módulo da sessão:
-- solta, esta tabela é o livro de clientes inteiro da empresa, com quanto cada
-- um comprou. Foi exatamente esse vazamento que o PCP teve.
alter table public.painel_ordens enable row level security;
revoke all on table public.painel_ordens from anon, authenticated;

comment on table public.painel_ordens is
  'O.S. como linha, para a busca por cliente da tela de Permutas alcancar o historico. Sem itens: o total basta. Alimentada pela mesma carga do painel_cache.';

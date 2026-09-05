-- A galeria consulta somente as fotos do bem aberto, com ordem estável.
create index if not exists painel_fotos_bem_idx
on public.painel_registros ((registro->>'bemId'), id)
where colecao = 'patrimonio_foto';

-- Consolida equipe_contas + painel_contas em acesso_conta/acesso_papel.
-- Idempotente: rodar duas vezes nao duplica nada.
--
-- Decisoes da direcao (05/08/2026):
--   `leo` (PCP) e a mesma pessoa que `leonardo`  -> funde
--   `pedro` do Brief e do PCP e a mesma pessoa   -> ja e a mesma chave
--   `thiago` fica sem amarrar ao RH
--   contas de grupo entram como tipo 'funcao' (a direcao reclassifica na tela)

with apelidos(de, para) as (values ('leo', 'leonardo')),
grupo(usuario) as (values ('equipe'), ('admin'), ('comercial'), ('montagem')),
rh(usuario, colaborador) as (values
  ('leonardo', 'Leonardo Gonçalves'),
  ('pedro',    'Pedro Henrique Golçalves Pereira'),
  ('barbara',  'Barbara Patrícia F. Vasconcelos'),
  ('candida',  'Candida Eliza David Barros'),
  ('jessica',  'Jessica Fernanda Souza Sampaio'),
  ('michelle', 'Michelle Petrone Dias'),
  ('karen',    'Karen Luiza Rodrigues Duarte'),
  ('marcella', 'Marcella Laiara Rocha Farias'),
  ('adilson',  'Adilson Barbosa Fonseca'),
  ('saulo',    'Saulo Rodrigues Ferreira'),
  ('eberth',   'Eberth Soares Santos'),
  ('raphael',  'Raphael Terra Alves Sales')
),
-- Toda linha de conta das duas tabelas, ja com o apelido resolvido.
bruto as (
  select coalesce(a.para, e.usuario) as usuario,
         nullif(e.nome, '') as nome, e.sistema, coalesce(e.papel,'') as papel,
         '[]'::jsonb as permissoes, '' as vendedor_id,
         coalesce(e.ativo, true) as ativo,
         'equipe:' || e.sistema as origem, e.hash, e.salt, coalesce(e.iter,120000) as iter
    from equipe_contas e left join apelidos a on a.de = e.usuario
  union all
  select coalesce(a.para, p.usuario), nullif(p.nome,''), 'painel', '',
         coalesce(p.permissoes,'[]'::jsonb), coalesce(p.vendedor_id,''), true,
         'painel', p.hash, p.salt, coalesce(p.iter,120000)
    from painel_contas p left join apelidos a on a.de = p.usuario
),
-- Uma conta por usuario. O nome escolhido e o MAIS LONGO entre os que
-- aparecem: "Barbara Vasconcelos" diz mais que "Bárbara".
pessoas as (
  select usuario,
         (array_agg(nome order by length(nome) desc nulls last))[1] as nome,
         bool_or(ativo) as ativo
    from bruto group by usuario
),
inseridas as (
  insert into acesso_conta (usuario, nome, tipo, colaborador, ativo)
  select p.usuario,
         coalesce(p.nome, initcap(p.usuario)),
         case when g.usuario is not null then 'funcao' else 'pessoa' end::acesso_tipo_conta,
         coalesce(r.colaborador, ''),
         p.ativo
    from pessoas p
    left join grupo g on g.usuario = p.usuario
    left join rh    r on r.usuario = p.usuario
  on conflict (usuario) do update
     set nome = excluded.nome, colaborador = excluded.colaborador,
         atualizado_em = now()
  returning id, usuario
),
todas as (select id, usuario from acesso_conta),
papeis as (
  insert into acesso_papel (conta_id, sistema, papel, permissoes, vendedor_id, ativo)
  select t.id, b.sistema, b.papel, b.permissoes, b.vendedor_id, b.ativo
    from bruto b join todas t on t.usuario = b.usuario
  on conflict (conta_id, sistema) do update
     set papel = excluded.papel, permissoes = excluded.permissoes,
         vendedor_id = excluded.vendedor_id, ativo = excluded.ativo
  returning 1
),
senhas as (
  insert into acesso_senha_legado (conta_id, origem, hash, salt, iter)
  select t.id, b.origem, b.hash, b.salt, b.iter
    from bruto b join todas t on t.usuario = b.usuario
   where b.hash is not null and b.salt is not null
  on conflict (conta_id, origem) do nothing
  returning 1
)
select
  (select count(*) from pessoas) as contas,
  (select count(*) from papeis)  as papeis,
  (select count(*) from senhas)  as senhas_guardadas;

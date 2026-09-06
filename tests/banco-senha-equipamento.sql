-- Somente tabelas temporárias: nenhuma senha ou equipamento real é alterado.
alter table pg_temp.equipe_contas add constraint hash_teste check(hash<>'simular-falha');
insert into pg_temp.equipe_contas(sistema,usuario,papel,hash,salt,iter) values('pcp','teste','operador','anterior','ficticio',120000);
insert into pg_temp.acesso_conta(usuario) values('teste');
do $$
declare falhou boolean:=false; r jsonb;
begin
 perform pg_temp.painel_senha_sincronizar('teste','{"nome":"Teste","permissoes":[]}','{"hash":"anterior","salt":"ficticio","iter":120000}');
 begin perform pg_temp.painel_senha_sincronizar('teste','{"nome":"Teste","permissoes":[]}','{"hash":"simular-falha","salt":"ficticio","iter":120000}'); exception when others then falhou:=true; end;
 if not falhou or (select hash from pg_temp.painel_contas where usuario='teste')<>'anterior' then raise exception 'Senha parcial não foi desfeita'; end if;
 perform pg_temp.painel_senha_sincronizar('teste','{"nome":"Teste","permissoes":[]}','{"hash":"nova","salt":"ficticio","iter":120000}');
 if (select hash from pg_temp.painel_contas where usuario='teste')<>'nova' or (select hash from pg_temp.equipe_contas where usuario='teste')<>'nova' or (select hash from pg_temp.acesso_senha_legado limit 1)<>'nova' then raise exception 'Senha divergente entre entradas'; end if;
 r:=pg_temp.painel_equipamento_gravar('teste','{"id":"teste","tipo":"maquina","nome":"Exemplo"}',null,'pat-teste','{"setorSigla":"GER","nomeGenerico":"Exemplo","valor":100}','auditoria');
 if not exists(select 1 from pg_temp.painel_registros where colecao='ativo' and id='teste') or not exists(select 1 from pg_temp.painel_registros where colecao='patrimonio' and id='pat-teste') then raise exception 'Equipamento sem vínculo'; end if;
 falhou:=false;
 begin perform pg_temp.painel_equipamento_gravar('rollback','{"id":"rollback","tipo":"maquina"}',null,null,'{}','auditoria'); exception when others then falhou:=true; end;
 if not falhou or exists(select 1 from pg_temp.painel_registros where colecao='ativo' and id='rollback') then raise exception 'Equipamento foi salvo pela metade'; end if;
 falhou:=false;
 begin perform pg_temp.painel_ativo_retirar('teste','bem-inexistente','auditoria'); exception when others then falhou:=true; end;
 if not falhou or not exists(select 1 from pg_temp.painel_registros where colecao='ativo' and id='teste') then raise exception 'Baixa parcial'; end if;
 perform pg_temp.painel_ativo_retirar('teste','pat-teste','auditoria');
 if exists(select 1 from pg_temp.painel_registros where colecao='ativo' and id='teste') or not exists(select 1 from pg_temp.painel_registros where colecao='ativo_lixeira' and id='teste') or (select registro->>'situacao' from pg_temp.painel_registros where colecao='patrimonio' and id='pat-teste')<>'baixado' then raise exception 'Baixa não preservou vínculo e histórico'; end if;
end $$;

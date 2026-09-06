do $$
declare r jsonb; falhou boolean:=false;
begin
 r:=pg_temp.painel_config_mesclar('{"parametros":{"caixa":100,"dias":30}}');
 r:=pg_temp.painel_config_mesclar('{"parametros":{"caixa":200}}');
 r:=pg_temp.painel_config_mesclar('{"parametros":{"dias":40}}');
 if r->'parametros'<>'{"caixa":200,"dias":40}'::jsonb then raise exception 'Edições em campos diferentes se perderam'; end if;
 begin perform pg_temp.painel_config_mesclar('{"parametros":{"dias":50}}','{"parametros":{"dias":30}}'); exception when serialization_failure then falhou:=true; end;
 if not falhou then raise exception 'Conflito de configuração não foi recusado'; end if;
 perform pg_temp.painel_registro_gravar('teste','1','{"texto":"primeiro"}',null);
 perform pg_temp.painel_registro_gravar('teste','1','{"texto":"segundo"}','{"texto":"primeiro"}');
 falhou:=false;
 begin perform pg_temp.painel_registro_gravar('teste','1','{"texto":"atrasado"}','{"texto":"primeiro"}'); exception when serialization_failure then falhou:=true; end;
 if not falhou then raise exception 'Gravação concorrente apagou registro'; end if;
 -- Um registro válido seguido de uma conta inválida deve desfazer a primeira gravação.
 falhou:=false;
 begin perform pg_temp.painel_restaurar_atomico('{"registros":[{"colecao":"teste","id":"rollback","registro":{"nome":"fictício"}}],"contas":[{"usuario":"invalido"}]}'); exception when others then falhou:=true; end;
 if not falhou or exists(select 1 from pg_temp.painel_registros where id='rollback') then raise exception 'Restauração parcial não desfez a gravação'; end if;
 r:=pg_temp.painel_restaurar_atomico('{"config":{"parametros":{"caixa":500}},"registros":[{"colecao":"permutas","id":"teste","registro":{"credito":1000}},{"colecao":"patrimonio","id":"equipamento","registro":{"nome":"fictício"}}],"contas":[{"usuario":"ficticio","nome":"Teste isolado","hash":"hashficticio","salt":"saltficticio","iter":120000}]}');
 if r->>'gravou'<>'3' or r->>'contas'<>'1' or r->>'verificado'<>'true' then raise exception 'Contagem de restauração incorreta'; end if;
 if not exists(select 1 from pg_temp.painel_registros where colecao='permutas' and id='teste' and registro->>'credito'='1000') then raise exception 'Permuta não restaurou'; end if;
end $$;

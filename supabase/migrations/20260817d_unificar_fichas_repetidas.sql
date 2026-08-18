begin;
-- colaboradores_43ha4hms17l: 14 campo(s) migrados
update registros set registro = registro || '{"cidade": "Montes Claros/MG", "funcao": "Assistente Administrativo", "empresa": "Impresilk", "ehDirecao": false, "motivacao": 65, "adicionais": 0, "cargoLivre": "Assistente Administrativo", "conjugeNome": "Fernanda Santos", "enderecoCep": "39383-175", "enderecoNumero": "180", "conjugeTelefone": "(38) 99346-6356", "matriculaEsocial": "63244-7", "contatoEmergencia": {"nome": "Fernanda Santos", "telefone": "(38) 99346-6356", "parentesco": "Cônjuge"}, "motivacaoAnterior": 69}'::jsonb, atualizado_em = now() where colecao='colaboradores' and id='colaboradores_43ha4hms17l';
update registros set registro = jsonb_set(registro,'{colaboradorId}','"colaboradores_43ha4hms17l"'::jsonb), atualizado_em = now() where colecao not in ('colaboradores','acessos','alteracoes') and registro->>'colaboradorId' = 'kelly-raissa-soares-ruas';
update registros set apagado = true, atualizado_em = now() where colecao='colaboradores' and id='kelly-raissa-soares-ruas';
-- jose-adilando-pereira: 3 campo(s) migrados
update registros set registro = registro || '{"filhos": [{"nome": "Lucas", "nascimento": "2016-07-30"}, {"nome": "Sofia", "nascimento": "2017-07-30"}], "dataDesligamento": "2026-08-03", "contatoEmergencia": {"nome": "Roberto Santos", "telefone": "(38) 98473-3474", "parentesco": "Mãe"}}'::jsonb, atualizado_em = now() where colecao='colaboradores' and id='jose-adilando-pereira';
update registros set registro = jsonb_set(registro,'{colaboradorId}','"jose-adilando-pereira"'::jsonb), atualizado_em = now() where colecao not in ('colaboradores','acessos','alteracoes') and registro->>'colaboradorId' = 'jose-adilando-pereira-2';
update registros set apagado = true, atualizado_em = now() where colecao='colaboradores' and id='jose-adilando-pereira-2';
update registros set registro = jsonb_set(registro,'{colaboradorId}','"jose-adilando-pereira"'::jsonb), atualizado_em = now() where colecao not in ('colaboradores','acessos','alteracoes') and registro->>'colaboradorId' = 'jose-adilando';
update registros set apagado = true, atualizado_em = now() where colecao='colaboradores' and id='jose-adilando';
-- demerval-vieira: 5 campo(s) migrados
update registros set registro = registro || '{"dataDesligamento": "2026-06-22", "contatoEmergencia": {"nome": "Roberto Silva", "telefone": "(38) 99327-1855", "parentesco": "Mãe"}, "filhos": [{"nome": "Gabriel", "nascimento": "2015-07-30"}, {"nome": "Ana", "nascimento": "2024-07-30"}, {"nome": "Pedro", "nascimento": "2023-07-30"}], "conjugeNome": "Roberto Costa", "conjugeTelefone": "(38) 99337-3226"}'::jsonb, atualizado_em = now() where colecao='colaboradores' and id='demerval-vieira';
update registros set registro = jsonb_set(registro,'{colaboradorId}','"demerval-vieira"'::jsonb), atualizado_em = now() where colecao not in ('colaboradores','acessos','alteracoes') and registro->>'colaboradorId' = 'dermeval-vieira';
update registros set apagado = true, atualizado_em = now() where colecao='colaboradores' and id='dermeval-vieira';
update registros set registro = jsonb_set(registro,'{colaboradorId}','"demerval-vieira"'::jsonb), atualizado_em = now() where colecao not in ('colaboradores','acessos','alteracoes') and registro->>'colaboradorId' = 'dermeval-vieira-2';
update registros set apagado = true, atualizado_em = now() where colecao='colaboradores' and id='dermeval-vieira-2';
commit;

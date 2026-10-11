-- CENTRO DE COMANDO DO MARKETING, integrações (etapa i, 12/10/2026).
-- Contrato em docs/marketing/integracoes-contrato.md, seção 1.
--
-- Cinco peças no banco, e nenhuma tabela nova:
--  1. o COFRE das conexões OAuth (Google, LinkedIn, Pinterest), em cima do
--     Vault do Supabase. O token mora cifrado no Vault e só a service_role
--     chega nele, por estas funções. A tela nunca vê token: ela recebe a
--     painel_mkt_conexao_info, que só tem datas, conta e escopos. A coleta
--     regrava só se a conexão ainda é a mesma (painel_mkt_conexao_regravar),
--     cada clique em Conectar vale uma volta só (pedido e consumir), e a
--     volta do provedor não grava no cofre: deixa a conexão PENDENTE, que só
--     entra quando quem clicou confirma com o crachá dele (pendente e
--     confirmar, revisão de 12/10);
--  2. a gravação dos NÚMEROS QUE VÊM DA API nas tabelas da a2
--     (painel_mkt_metricas_canal e painel_mkt_publicacoes), com fonte 'api',
--     a ORIGEM DE CADA NÚMERO (a coluna numeros_api, a única coisa nova nas
--     tabelas) e a faxina da regra de guarda do LinkedIn;
--  3. o DIÁRIO e as TRAVAS da coleta (painel_mkt_coleta_anotar e
--     painel_mkt_coleta_pedir), cada uma num passo só no banco;
--  4. o LOG DA COLETA: a regravação de um número que já era da API, feita
--     pela coleta, não vai mais para o painel_mkt_log (a troca de número de
--     gente continua indo), e o que vai sai depois de 1 ano;
--  5. o AGENDAMENTO (pg_cron): uma coleta por fonte, todo dia de manhã.
--
-- ORDEM DE PUBLICAÇÃO (contrato, seção 1): primeiro as Edge Functions, e
-- conferir que a painel-mkt-fontes responde 401 a um POST sem x-token; só
-- então esta migração, no mesmo dia e antes das 09:05 UTC. Aplicada antes, o
-- cron das 09:05 bate numa function que ainda não existe, o pg_cron marca
-- "succeeded" e ninguém fica sabendo.
--
-- POR QUE NENHUMA TABELA NOVA: o retrato rico de cada fonte (o que a tela
-- desenha) vai para painel_cache, que fica fora do backup de propósito: é
-- refeito pela próxima coleta. Uma tabela painel_mkt_* nova teria de entrar
-- em TABELAS_MARKETING da painel-backup e na painel_mkt_exportar/restaurar,
-- e o teste "a cópia lista as tabelas painel_mkt_* que existem" quebraria.
--
-- Mesmo padrão da a1 e da a2: funções security definer com search_path fixo,
-- nada para public, anon e authenticated (o Supabase dá execute a anon e
-- authenticated por privilégio padrão em toda função nova do schema public;
-- por isso o revoke é explícito), execute só para a service_role, que é a
-- das Edge Functions.
--
-- NADA DE SEGREDO AQUI. Este repositório é PÚBLICO. O x-token dos jobs é lido
-- do Vault na hora de rodar (o mesmo jeito de 0002_cron_backup.sql), e o
-- token das conexões entra pelo OAuth, nunca por arquivo.
--
-- As extensões pg_cron, pg_net e supabase_vault já foram criadas pela
-- 0002_cron_backup.sql. Não repito o "create extension" aqui porque o teste
-- em PGlite não tem essas extensões (ele cria stubs dos schemas vault, cron e
-- net) e o create extension derrubaria a migração inteira lá.

-- =================================================================== COFRE ==
-- O segredo de cada conexão mora no Vault com o nome mkt_conexao_<fonte>. O
-- JSON guardado tem esta forma:
--   {access_token?, refresh_token?, expira_em?, refresh_expira_em?,
--    escopos: [], conta?, conectado_por, conectado_em}
-- Só três fontes usam OAuth. Meta, Google Ads e o site vão por secret da Edge
-- Function e não passam por aqui; uma fonte fora da lista é erro (22023), e
-- não um segredo novo com nome inventado.

-- Gravar: cria na primeira vez, atualiza depois. A trava por fonte existe
-- porque o retorno do OAuth e a renovação feita pela coletora podem chegar
-- juntos; sem ela, os dois achariam "não existe" e o segundo create_secret
-- bateria no nome único do Vault.
create or replace function public.painel_mkt_conexao_gravar(p_fonte text, p_valor jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare nome text; existente uuid;
begin
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  -- A mensagem nunca repete o valor: ele pode ter token.
  if jsonb_typeof(p_valor) is distinct from 'object' then
    raise exception 'A conexão precisa ser um objeto JSON' using errcode = '22023';
  end if;
  nome := 'mkt_conexao_' || p_fonte;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id into existente from vault.decrypted_secrets where name = nome;
  if existente is null then
    perform vault.create_secret(p_valor::text, nome, 'Conexão do Marketing (' || p_fonte || '), gravada pela painel_mkt_conexao_gravar');
  else
    perform vault.update_secret(existente, p_valor::text, nome, 'Conexão do Marketing (' || p_fonte || '), gravada pela painel_mkt_conexao_gravar');
  end if;
end $$;

-- Regravar: a gravação da COLETORA, que só grava se a conexão no cofre
-- ainda é a mesma que ela leu (troca condicional). Por que não a gravar de
-- cima: a coleta dura até 110 s, e no meio dela a gestão pode Desconectar
-- (o cofre vira 'null') ou Reconectar com outra conta. Gravar por cima, no
-- fim, ressuscitava a conexão apagada (no LinkedIn e no Pinterest, que não
-- revogam por API, com token valendo) ou trocava a conta nova pela antiga.
-- A conexão é a mesma quando access_token, refresh_token e conectado_em
-- batem com p_esperado (só esses três: a coletora manda só eles). Cofre
-- vazio, apagado, ilegível ou com outra conexão: não grava e devolve
-- 'mudou'; gravou, 'gravada'. A confirmação de quem clicou em Conectar
-- (painel_mkt_conexao_confirmar) continua gravando de cima, pela
-- painel_mkt_conexao_gravar: conectar é a vontade de agora de quem clicou.
create or replace function public.painel_mkt_conexao_regravar(p_fonte text, p_esperado jsonb, p_valor jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare nome text; existente uuid; bruto text; v jsonb;
begin
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  if jsonb_typeof(p_valor) is distinct from 'object' or jsonb_typeof(p_esperado) is distinct from 'object' then
    raise exception 'A conexão e a esperada precisam ser objetos JSON' using errcode = '22023';
  end if;
  nome := 'mkt_conexao_' || p_fonte;
  -- A mesma trava da gravar e da apagar: o Desconectar que chega junto
  -- espera esta terminar (ou esta espera ele, e aí acha 'null').
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id, decrypted_secret into existente, bruto from vault.decrypted_secrets where name = nome;
  if existente is null or bruto is null then return 'mudou'; end if;
  begin v := bruto::jsonb; exception when others then return 'mudou'; end;
  if jsonb_typeof(v) is distinct from 'object' then return 'mudou'; end if;
  if (v->>'access_token', v->>'refresh_token', v->>'conectado_em')
     is distinct from (p_esperado->>'access_token', p_esperado->>'refresh_token', p_esperado->>'conectado_em') then
    return 'mudou';
  end if;
  perform vault.update_secret(existente, p_valor::text, nome, 'Conexão do Marketing (' || p_fonte || '), regravada pela coleta');
  return 'gravada';
end $$;

-- Os PEDIDOS DE CONEXÃO em andamento (o clique em Conectar). O state que vai
-- ao provedor é assinado, mas assinatura sozinha deixava o mesmo state valer
-- várias vezes durante os 10 minutos: quem visse a URL (histórico do
-- navegador, a volta) trocava a conexão da casa pela conta dele, com a
-- autoria de quem clicou. Agora cada clique guarda o seu nonce aqui, e a
-- volta CONSOME o nonce (painel_mkt_conexao_consumir): state já usado, ou
-- desconhecido, não troca code nenhum. Isso só segura quem chega DEPOIS da
-- primeira volta; quem chega ANTES do Léo é segurado pela pendente (abaixo),
-- que só entra no cofre com o crachá de quem clicou. Junto vai o verificador do PKCE,
-- quando o provedor usa (ver PROVEDORES em _shared/mkt-oauth.mjs): ele nunca
-- sai do servidor.
-- Mora no painel_cache (RLS ligado, sem política: só a service_role chega),
-- com a chave mkt_oauth_<nonce>. Cada pedido novo leva junto os vencidos.
--
-- E o clique novo derruba a conexão PENDENTE daquela fonte (ver
-- painel_mkt_conexao_pendente, abaixo): quem clica em Conectar de novo
-- desistiu do clique anterior. É o que fecha o caso de quem usou a URL do
-- Léo antes dele: a volta do Léo dá state_invalido, ele clica de novo, e a
-- pendente do outro (com a conta do outro) sai sem nunca ter chegado ao cofre.
create or replace function public.painel_mkt_conexao_pedido(p_nonce text, p_fonte text, p_quem text, p_verificador text, p_validade_s integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid; pbruto text;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'Nonce inválido' using errcode = '22023'; end if;
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  if p_quem is null or length(btrim(p_quem)) not between 1 and 100 then raise exception 'Quem pediu é obrigatório' using errcode = '22023'; end if;
  -- O verificador do PKCE (RFC 7636): 43 a 128 letras do alfabeto deles.
  if p_verificador is not null and p_verificador !~ '^[A-Za-z0-9._~-]{43,128}$' then raise exception 'Verificador inválido' using errcode = '22023'; end if;
  if p_validade_s is null or p_validade_s not between 60 and 3600 then raise exception 'Validade fora de 60 a 3600 s' using errcode = '22023'; end if;
  -- O "case" garante a ordem: o cast só roda no que é número.
  delete from public.painel_cache
   where chave like 'mkt\_oauth\_%'
     and case when jsonb_typeof(valor->'exp') = 'number' then (valor->>'exp')::numeric < extract(epoch from now()) else true end;
  -- A mesma trava da gravar, da apagar e da confirmar.
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id, decrypted_secret into pid, pbruto from vault.decrypted_secrets where name = 'mkt_pendente_' || p_fonte;
  if pid is not null and pbruto is distinct from 'null' then
    perform vault.update_secret(pid, 'null', 'mkt_pendente_' || p_fonte,
      'Conexão pendente do Marketing (' || p_fonte || ') trocada por um clique novo em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  end if;
  insert into public.painel_cache (chave, valor, atualizado_em)
  values ('mkt_oauth_' || p_nonce,
          jsonb_build_object('fonte', p_fonte, 'quem', btrim(p_quem), 'verificador', p_verificador,
                             'exp', floor(extract(epoch from now()))::bigint + p_validade_s),
          now());
end $$;

-- Consumir: apaga e devolve, num passo só ({fonte, quem, verificador}), ou
-- null quando o nonce não existe, já foi usado ou venceu. Duas voltas com o
-- mesmo state ao mesmo tempo: o delete de uma espera o da outra e não acha
-- mais nada.
create or replace function public.painel_mkt_conexao_consumir(p_nonce text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' then return null; end if;
  delete from public.painel_cache where chave = 'mkt_oauth_' || p_nonce returning valor into v;
  if v is null then return null; end if;
  if not (case when jsonb_typeof(v->'exp') = 'number' then (v->>'exp')::numeric >= extract(epoch from now()) else false end) then
    return null;
  end if;
  return jsonb_build_object('fonte', v->'fonte', 'quem', v->'quem', 'verificador', v->'verificador');
end $$;

-- A CONEXÃO PENDENTE (revisão de 12/10). O state de uso único não amarrava a
-- conclusão a quem clicou: quem tivesse a URL da tela de permissão (aba
-- esquecida, histórico do computador do escritório, link colado para pedir
-- ajuda) e voltasse antes do Léo conectava a CONTA DELE, com a autoria do
-- Léo, e o PKCE não impede (o desafio vai na mesma URL). Por isso a volta do
-- provedor (painel-mkt-oauth, que não tem crachá) não grava mais no cofre:
-- guarda a conexão aqui, PENDENTE, amarrada ao pedido (nonce e quem clicou),
-- e ela só entra no cofre quando a tela, COM O CRACHÁ de quem clicou, chama a
-- painel_mkt_conexao_confirmar. O navegador de outra pessoa até completa o
-- consentimento, mas não tem esse crachá: a conexão dele vence aqui sem nunca
-- chegar à coleta.
-- Mora no Vault, cifrada, com o nome mkt_pendente_<fonte> (uma por fonte: a
-- volta mais nova manda), no JSON {nonce, quem, exp, conexao}. Nunca no
-- painel_cache: ali ficaria o token em texto aberto, ao alcance de quem lê o
-- cache. Vale p_validade_s (a painel-mkt-oauth manda 10 minutos).
create or replace function public.painel_mkt_conexao_pendente(p_nonce text, p_fonte text, p_quem text, p_valor jsonb, p_validade_s integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare nome text; existente uuid; v jsonb;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'Nonce inválido' using errcode = '22023'; end if;
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  if p_quem is null or length(btrim(p_quem)) not between 1 and 100 then raise exception 'Quem pediu é obrigatório' using errcode = '22023'; end if;
  -- A mensagem nunca repete o valor: ele tem token.
  if jsonb_typeof(p_valor) is distinct from 'object' then raise exception 'A conexão precisa ser um objeto JSON' using errcode = '22023'; end if;
  if p_validade_s is null or p_validade_s not between 60 and 3600 then raise exception 'Validade fora de 60 a 3600 s' using errcode = '22023'; end if;
  nome := 'mkt_pendente_' || p_fonte;
  v := jsonb_build_object('nonce', p_nonce, 'quem', btrim(p_quem),
                          'exp', floor(extract(epoch from now()))::bigint + p_validade_s, 'conexao', p_valor);
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id into existente from vault.decrypted_secrets where name = nome;
  if existente is null then
    perform vault.create_secret(v::text, nome, 'Conexão pendente do Marketing (' || p_fonte || '), à espera da confirmação de quem clicou');
  else
    perform vault.update_secret(existente, v::text, nome, 'Conexão pendente do Marketing (' || p_fonte || '), à espera da confirmação de quem clicou');
  end if;
end $$;

-- Confirmar: num passo só, sob a trava da fonte, confere e MOVE a pendente
-- para o cofre (pela painel_mkt_conexao_gravar) e a apaga. Devolve
-- {ok: true}, ou {ok: false, motivo} com um destes códigos (a tela traduz
-- pelo MOTIVOS de _shared/mkt-oauth.mjs):
--  * pedido_vencido: não há pendente com este nonce nesta fonte (nunca
--    houve, já foi confirmada, foi trocada por um clique novo, o Desconectar
--    a levou) ou ela passou da validade (e aí sai já: o token não fica
--    esperando);
--  * outra_pessoa: a pendente é de outro login. Ela FICA, para quem clicou
--    ainda poder confirmar: a recusa não pode virar um jeito de derrubar a
--    conexão dos outros.
-- Uso único: duas confirmações juntas esperam uma pela outra na trava, e a
-- segunda já acha a pendente apagada.
create or replace function public.painel_mkt_conexao_confirmar(p_fonte text, p_nonce text, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare nome text; existente uuid; bruto text; v jsonb;
        vencida constant jsonb := jsonb_build_object('ok', false, 'motivo', 'pedido_vencido');
begin
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  if p_quem is null or length(btrim(p_quem)) not between 1 and 100 then raise exception 'Quem confirma é obrigatório' using errcode = '22023'; end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' then return vencida; end if;
  nome := 'mkt_pendente_' || p_fonte;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id, decrypted_secret into existente, bruto from vault.decrypted_secrets where name = nome;
  if existente is null or bruto is null then return vencida; end if;
  begin v := bruto::jsonb; exception when others then v := null; end;
  -- Outro nonce é outro pedido: não diz de quem é, nem se existe.
  if jsonb_typeof(v) is distinct from 'object' or v->>'nonce' is distinct from p_nonce then return vencida; end if;
  if not (case when jsonb_typeof(v->'exp') = 'number' then (v->>'exp')::numeric >= extract(epoch from now()) else false end)
     or jsonb_typeof(v->'conexao') is distinct from 'object' then
    perform vault.update_secret(existente, 'null', nome,
      'Conexão pendente do Marketing (' || p_fonte || ') vencida sem confirmação em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
    return vencida;
  end if;
  if v->>'quem' is distinct from btrim(p_quem) then return jsonb_build_object('ok', false, 'motivo', 'outra_pessoa'); end if;
  perform public.painel_mkt_conexao_gravar(p_fonte, v->'conexao');
  perform vault.update_secret(existente, 'null', nome,
    'Conexão pendente do Marketing (' || p_fonte || ') confirmada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  return jsonb_build_object('ok', true);
end $$;

-- Ler: o JSON decifrado, ou null quando não há conexão (nunca gravada, ou
-- apagada). Só a coletora chama, para usar o token.
create or replace function public.painel_mkt_conexao_ler(p_fonte text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare bruto text; v jsonb;
begin
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  select decrypted_secret into bruto from vault.decrypted_secrets where name = 'mkt_conexao_' || p_fonte;
  if bruto is null then return null; end if;
  -- O erro do Postgres para JSON quebrado cita um pedaço do texto ("Token
  -- ... is invalid"), e o texto aqui é o token. Por isso o erro original é
  -- trocado por um que não carrega nada do conteúdo.
  begin
    v := bruto::jsonb;
  exception when others then
    raise exception 'A conexão guardada de % está ilegível no cofre; conecte de novo', p_fonte using errcode = 'XX001';
  end;
  if jsonb_typeof(v) = 'object' then return v; end if;
  -- 'null' é a conexão apagada (ver painel_mkt_conexao_apagar).
  if jsonb_typeof(v) = 'null' then return null; end if;
  raise exception 'A conexão guardada de % está ilegível no cofre; conecte de novo', p_fonte using errcode = 'XX001';
end $$;

-- Info: o que a tela pode ver de cada conexão. Lista FECHADA de campos
-- (nunca "o objeto menos os tokens"): um campo novo que o provedor mandar,
-- como um id_token, fica de fora sem ninguém precisar lembrar dele. E cada
-- campo só passa se for texto ou número; um objeto escondido em "conta"
-- levaria junto o que tivesse dentro. As três fontes sempre aparecem, com
-- null quando não há conexão (ou quando ela está ilegível: a tela mostra
-- "Conectar", e conectar de novo regrava por cima).
create or replace function public.painel_mkt_conexao_info()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f text; bruto text; v jsonb; r jsonb := '{}'::jsonb;
begin
  foreach f in array array['google', 'linkedin', 'pinterest'] loop
    v := null;
    select decrypted_secret into bruto from vault.decrypted_secrets where name = 'mkt_conexao_' || f;
    if bruto is not null then
      begin v := bruto::jsonb; exception when others then v := null; end;
    end if;
    if jsonb_typeof(v) = 'object' then
      r := r || jsonb_build_object(f, jsonb_build_object(
        'conectado_em', case when jsonb_typeof(v->'conectado_em') in ('string', 'number') then v->'conectado_em' end,
        'conectado_por', case when jsonb_typeof(v->'conectado_por') in ('string', 'number') then v->'conectado_por' end,
        'conta', case when jsonb_typeof(v->'conta') in ('string', 'number') then v->'conta' end,
        'escopos', case when jsonb_typeof(v->'escopos') = 'array'
                        then (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v->'escopos') e where jsonb_typeof(e) = 'string')
                        else '[]'::jsonb end,
        'expira_em', case when jsonb_typeof(v->'expira_em') in ('string', 'number') then v->'expira_em' end,
        'refresh_expira_em', case when jsonb_typeof(v->'refresh_expira_em') in ('string', 'number') then v->'refresh_expira_em' end));
    else
      r := r || jsonb_build_object(f, null);
    end if;
  end loop;
  return r;
end $$;

-- Apagar: o valor guardado vira 'null'. Por que sobrescrever em vez de
-- apagar a linha: a API do Vault que este projeto usa é create_secret,
-- update_secret e a view decrypted_secrets. Sobrescrever destrói o token pelo
-- mesmo caminho que o grava, sem depender de permissão de DELETE direto na
-- tabela interna do Vault. O nome continua reservado e a próxima conexão
-- grava por cima; ler e info tratam 'null' como "sem conexão".
-- O Desconectar leva junto a conexão PENDENTE da fonte (a que voltou do
-- provedor e ainda não foi confirmada): desconectar é "nenhuma conexão
-- desta fonte", e uma pendente confirmada depois desfaria isso.
create or replace function public.painel_mkt_conexao_apagar(p_fonte text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare nome text; existente uuid; pid uuid; pbruto text;
begin
  if p_fonte is null or p_fonte not in ('google', 'linkedin', 'pinterest') then
    raise exception 'Fonte sem conexão OAuth: %', left(coalesce(p_fonte, 'nula'), 30) using errcode = '22023';
  end if;
  nome := 'mkt_conexao_' || p_fonte;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:conexao:' || p_fonte, 0));
  select id into existente from vault.decrypted_secrets where name = nome;
  if existente is not null then
    perform vault.update_secret(existente, 'null', nome,
      'Conexão do Marketing (' || p_fonte || ') apagada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  end if;
  select id, decrypted_secret into pid, pbruto from vault.decrypted_secrets where name = 'mkt_pendente_' || p_fonte;
  if pid is not null and pbruto is distinct from 'null' then
    perform vault.update_secret(pid, 'null', 'mkt_pendente_' || p_fonte,
      'Conexão pendente do Marketing (' || p_fonte || ') apagada pelo Desconectar em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  end if;
end $$;

-- ================================================ A ORIGEM DE CADA NÚMERO ==
-- A fonte ('manual', 'csv', 'api') é da LINHA, e uma linha mistura número de
-- gente com número da API: a Ana lança leads numa semana, a coleta grava as
-- impressões na mesma semana, e a linha inteira vira 'api'. Decidir pela
-- linha errava dos dois lados (segunda revisão, 11/10):
--  * o log pulava a troca de um número de gente que estava numa linha 'api'
--    (os 40 cliques da Ana viravam 55 sem deixar rastro);
--  * a faxina do LinkedIn apagava número digitado (a linha era 'api') e não
--    alcançava o número da API numa linha que tinha virado 'manual'.
-- Por isso cada linha guarda QUAIS números a API gravou (numeros_api), e o
-- log e a faxina olham o número, não a linha:
--  * a coleta (motivo 'Coleta da API') que MUDA um número passa a ser a dona
--    dele. Número que ela só confirmou igual continua de quem era: a primeira
--    troca dele pela API ainda vai para o log;
--  * qualquer outra gravação (a tela, o CSV, a faxina, a volta do backup) que
--    muda um número tira esse número da lista: dali em diante ele é de gente.
--    Quem grava a lista de propósito (a faxina) manda nela.
-- Quem decide é um gatilho BEFORE, e não cada função: seis portas gravam
-- nessas tabelas (as duas da API, salvar e importar da a2, a faxina e a
-- volta do backup), e uma regra copiada em seis lugares deixa de bater no
-- primeiro conserto.
-- Nulo (linha de antes desta migração, ou cópia antiga voltando do backup) é
-- "nenhum número da API": o lado seguro para o log (a troca aparece) e para o
-- dado de gente (a faxina não apaga). Não entra check na coluna: um valor
-- estranho numa cópia de backup derrubaria a volta inteira; quem lê a lista
-- só considera os nomes de número da própria tabela.
alter table public.painel_mkt_metricas_canal add column if not exists numeros_api text[];
alter table public.painel_mkt_publicacoes add column if not exists numeros_api text[];

create or replace function public.painel_mkt_origem_numeros()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare numeros text[] := case when tg_table_name = 'painel_mkt_metricas_canal'
                                then array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads']
                                else array['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'] end;
        coleta boolean := coalesce(current_setting('painel.motivo', true), '') = 'Coleta da API';
        novo jsonb := to_jsonb(new); velho jsonb;
begin
  if tg_op = 'INSERT' then
    -- Linha nova da coleta: todo número que veio é dela. Linha nova de gente
    -- fica sem lista; a volta do backup traz a do arquivo.
    if coleta then
      new.numeros_api := array(select k from unnest(numeros) k where novo->>k is not null order by k);
    end if;
    return new;
  end if;
  velho := to_jsonb(old);
  if coleta then
    new.numeros_api := array(select distinct k
                               from unnest(coalesce(old.numeros_api, '{}'::text[])
                                           || array(select c from unnest(numeros) c where (velho->c) is distinct from (novo->c))) k
                              where k = any(numeros) order by k);
  elsif new.numeros_api is not distinct from old.numeros_api then
    new.numeros_api := array(select k from unnest(coalesce(old.numeros_api, '{}'::text[])) k
                              where k = any(numeros) and (velho->k) is not distinct from (novo->k) order by k);
  end if;
  return new;
end $$;

drop trigger if exists painel_mkt_metricas_canal_origem on public.painel_mkt_metricas_canal;
create trigger painel_mkt_metricas_canal_origem before insert or update on public.painel_mkt_metricas_canal
  for each row execute function public.painel_mkt_origem_numeros();
drop trigger if exists painel_mkt_publicacoes_origem on public.painel_mkt_publicacoes;
create trigger painel_mkt_publicacoes_origem before insert or update on public.painel_mkt_publicacoes
  for each row execute function public.painel_mkt_origem_numeros();

-- Uma cópia da linha (o antes ou o depois de uma linha do log) sem os números
-- da lista p_colunas que a PRÓPRIA cópia diz que a API gravou (o numeros_api
-- dela). É o que a faxina tira do log: o número que a pessoa digitou fica,
-- até na mesma linha de log.
create or replace function public.painel_mkt_sem_numeros_api(p jsonb, p_colunas text[])
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p) = 'object' and jsonb_typeof(p->'numeros_api') = 'array'
              then p - array(select k from jsonb_array_elements_text(p->'numeros_api') k where k = any(p_colunas))
              else p end
$$;

-- ====================================================== NÚMEROS DA SEMANA ==
-- Cada linha: {canal: '<codigo>', semana: 'AAAA-MM-DD' (segunda-feira),
-- numeros: {seguidores?, alcance?, impressoes?, engajamento?, cliques?,
-- conversas?, leads?}}.
--
-- Uma linha ruim não derruba as outras: a coleta de um dia inteiro não pode
-- se perder porque um canal foi desativado ou um número veio torto. A linha
-- vai para "ignoradas" com o motivo (código curto, a coletora traduz):
--   linha_invalida, canal_inexistente, semana_invalida (não é data ou não é
--   segunda), semana_aberta (o domingo dela ainda não acabou em São Paulo),
--   numero_invalido (com o campo), sem_numeros.
--
-- As regras de cada número:
--  * só o número que veio muda. Ausente E nulo são "não medido" e mantêm o
--    que estava. A painel_mkt_salvar_metricas apaga com nulo porque lá é
--    gente corrigindo engano; aqui nulo é métrica que a API recusou hoje, e
--    ela não pode apagar o número de ontem;
--  * o número da API manda sobre o lançado à mão (é medição, não estimativa);
--  * a fonte vira 'api' e coletado_em vai para agora juntos, e só quando a
--    linha muda de verdade (número diferente, ou o número era manual e a API
--    agora mediu). A coletora regrava as 8 últimas semanas todo dia: sem
--    isso, cada execução subiria a versão e encheria o log com linhas iguais;
--  * QUAIS números são da API (numeros_api) quem anota é o gatilho
--    painel_mkt_origem_numeros, acima: o número que a coleta mudou.
--
-- Devolve {gravadas, iguais, ignoradas: [{indice, canal, semana, motivo, campo?}]}.
-- "iguais" não está no contrato: são as linhas aceitas que não mudaram nada.
create or replace function public.painel_mkt_api_metricas(p_linhas jsonb, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; l jsonb; canal uuid; s date; nums jsonb; vals jsonb; k text; t text; ruim text;
        m public.painel_mkt_metricas_canal; gravadas int := 0; iguais int := 0; ign jsonb := '[]'::jsonb;
        hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if jsonb_typeof(p_linhas) is distinct from 'array' then raise exception 'Linhas inválidas' using errcode = '22023'; end if;
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform set_config('painel.motivo', 'Coleta da API', true);
  for r in select e.valor, e.posicao - 1 as indice from jsonb_array_elements(p_linhas) with ordinality as e(valor, posicao) loop
    l := r.valor;
    if jsonb_typeof(l) is distinct from 'object' then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', null, 'semana', null, 'motivo', 'linha_invalida'));
      continue;
    end if;
    select c.id into canal from public.painel_mkt_canais c where c.codigo = l->>'canal';
    if not found then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', left(l->>'canal', 60), 'semana', left(l->>'semana', 20), 'motivo', 'canal_inexistente'));
      continue;
    end if;
    begin s := (l->>'semana')::date; exception when others then s := null; end;
    if s is null or extract(isodow from s) <> 1 then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'semana', left(l->>'semana', 20), 'motivo', 'semana_invalida'));
      continue;
    end if;
    -- Semana fechada é a que já teve o domingo inteiro no fuso de São Paulo:
    -- a segunda seguinte (s + 7) já chegou. A semana em curso daria um número
    -- pela metade com cara de semana inteira.
    if s + 7 > hoje then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'semana', s, 'motivo', 'semana_aberta'));
      continue;
    end if;
    nums := l->'numeros';
    vals := '{}'::jsonb; ruim := null;
    if jsonb_typeof(nums) = 'object' then
      foreach k in array array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'] loop
        t := nums->>k;
        continue when t is null;
        -- Inteiro de 0 a 1 bilhão, os limites da tabela. Recusar aqui (e não
        -- deixar o check da tabela recusar) evita que um número torto
        -- derrube o lote inteiro.
        if t !~ '^[0-9]{1,10}$' or t::bigint > 1000000000 then ruim := k; exit; end if;
        vals := vals || jsonb_build_object(k, t::int);
      end loop;
    end if;
    if ruim is not null then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'semana', s, 'motivo', 'numero_invalido', 'campo', ruim));
      continue;
    end if;
    if vals = '{}'::jsonb then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'semana', s, 'motivo', 'sem_numeros'));
      continue;
    end if;

    select * into m from public.painel_mkt_metricas_canal where canal_id = canal and semana = s for update;
    if found then
      if m.fonte = 'api' and
         (coalesce((vals->>'seguidores')::int, m.seguidores), coalesce((vals->>'alcance')::int, m.alcance),
          coalesce((vals->>'impressoes')::int, m.impressoes), coalesce((vals->>'engajamento')::int, m.engajamento),
          coalesce((vals->>'cliques')::int, m.cliques), coalesce((vals->>'conversas')::int, m.conversas),
          coalesce((vals->>'leads')::int, m.leads))
         is not distinct from (m.seguidores, m.alcance, m.impressoes, m.engajamento, m.cliques, m.conversas, m.leads) then
        iguais := iguais + 1;
        continue;
      end if;
      update public.painel_mkt_metricas_canal set
        seguidores = coalesce((vals->>'seguidores')::int, m.seguidores), alcance = coalesce((vals->>'alcance')::int, m.alcance),
        impressoes = coalesce((vals->>'impressoes')::int, m.impressoes), engajamento = coalesce((vals->>'engajamento')::int, m.engajamento),
        cliques = coalesce((vals->>'cliques')::int, m.cliques), conversas = coalesce((vals->>'conversas')::int, m.conversas),
        leads = coalesce((vals->>'leads')::int, m.leads),
        fonte = 'api', coletado_em = now(), versao = m.versao + 1, atualizado_em = now(), atualizado_por = p_quem
      where id = m.id;
    else
      -- O "on conflict" cobre a pessoa que lançou a mesma semana à mão entre
      -- a leitura acima e esta gravação: os números dela que a API não mediu
      -- ficam.
      insert into public.painel_mkt_metricas_canal as x (canal_id, semana, seguidores, alcance, impressoes, engajamento, cliques,
                                                          conversas, leads, fonte, criado_por, atualizado_por)
      values (canal, s, (vals->>'seguidores')::int, (vals->>'alcance')::int, (vals->>'impressoes')::int, (vals->>'engajamento')::int,
              (vals->>'cliques')::int, (vals->>'conversas')::int, (vals->>'leads')::int, 'api', p_quem, p_quem)
      on conflict (canal_id, semana) do update set
        seguidores = coalesce(excluded.seguidores, x.seguidores), alcance = coalesce(excluded.alcance, x.alcance),
        impressoes = coalesce(excluded.impressoes, x.impressoes), engajamento = coalesce(excluded.engajamento, x.engajamento),
        cliques = coalesce(excluded.cliques, x.cliques), conversas = coalesce(excluded.conversas, x.conversas),
        leads = coalesce(excluded.leads, x.leads),
        fonte = 'api', coletado_em = now(), versao = x.versao + 1, atualizado_em = now(), atualizado_por = p_quem;
    end if;
    gravadas := gravadas + 1;
  end loop;
  return jsonb_build_object('gravadas', gravadas, 'iguais', iguais, 'ignoradas', ign);
end $$;

-- ============================================================ PUBLICAÇÕES ==
-- Cada linha: {canal, url, data, titulo?, alcance?, impressoes?,
-- engajamento?, cliques?, leads?}. A url chega normalizada pelo
-- normalizarLink de _shared/marketing.mjs; a chave é a da tabela (canal +
-- url). Sem url a linha não entra: sem chave, cada coleta criaria a mesma
-- publicação de novo.
--  * linha nova: entra com fonte 'api';
--  * linha que existe e não foi retirada: data, título e números vêm da API.
--    Número ausente ou nulo mantém o que estava; número que veio manda sobre
--    o lançado à mão. Fonte 'api' e coletado_em = agora andam juntos e só
--    quando um número muda (ou era manual e a API mediu): mudar só o título
--    não pode fingir medição nova;
--  * título vazio da API não apaga o título que existe (o LinkedIn, por
--    regra de guarda, nunca manda título);
--  * linha retirada não volta: alguém tirou de propósito, e a coleta do dia
--    seguinte não pode desfazer isso calada. Conta em "retiradas".
-- Devolve {inseridas, atualizadas, iguais, retiradas, ignoradas: [...]};
-- "ignoradas" (mesmo formato e motivos da painel_mkt_api_metricas, mais
-- url_invalida e data_invalida) não está no contrato.
--
-- A mesma trava da importação de CSV: a coleta e um CSV do mesmo canal ao
-- mesmo tempo não disputam a mesma linha nova (o unique daria 23505 e o lote
-- inteiro voltaria).
create or replace function public.painel_mkt_api_publicacoes(p_linhas jsonb, p_quem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; l jsonb; canal uuid; d date; link text; tit text; vals jsonb; k text; t text; ruim text;
        u public.painel_mkt_publicacoes; veio boolean; vira_api boolean;
        n_alc int; n_imp int; n_eng int; n_cli int; n_lea int; novo_titulo text;
        ins int := 0; atu int := 0; iguais int := 0; ret int := 0; ign jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_linhas) is distinct from 'array' then raise exception 'Linhas inválidas' using errcode = '22023'; end if;
  perform set_config('painel.quem', coalesce(p_quem, ''), true);
  perform set_config('painel.motivo', 'Coleta da API', true);
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:importar', 0));
  for r in select e.valor, e.posicao - 1 as indice from jsonb_array_elements(p_linhas) with ordinality as e(valor, posicao) loop
    l := r.valor;
    if jsonb_typeof(l) is distinct from 'object' then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', null, 'url', null, 'motivo', 'linha_invalida'));
      continue;
    end if;
    select c.id into canal from public.painel_mkt_canais c where c.codigo = l->>'canal';
    if not found then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', left(l->>'canal', 60), 'url', left(l->>'url', 500), 'motivo', 'canal_inexistente'));
      continue;
    end if;
    link := btrim(l->>'url');
    if link is null or link !~* '^https?://' or length(link) > 500 then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'url', left(link, 500), 'motivo', 'url_invalida'));
      continue;
    end if;
    begin d := (l->>'data')::date; exception when others then d := null; end;
    if d is null then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'url', link, 'motivo', 'data_invalida'));
      continue;
    end if;
    vals := '{}'::jsonb; ruim := null;
    foreach k in array array['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'] loop
      t := l->>k;
      continue when t is null;
      if t !~ '^[0-9]{1,10}$' or t::bigint > 1000000000 then ruim := k; exit; end if;
      vals := vals || jsonb_build_object(k, t::int);
    end loop;
    if ruim is not null then
      ign := ign || jsonb_build_array(jsonb_build_object('indice', r.indice, 'canal', l->>'canal', 'url', link, 'motivo', 'numero_invalido', 'campo', ruim));
      continue;
    end if;
    -- Título: o da tabela vai até 200 letras; o da API (texto de post do
    -- Facebook, por exemplo) pode ser bem maior e é cortado em vez de recusado.
    tit := left(nullif(btrim(l->>'titulo'), ''), 200);
    veio := vals <> '{}'::jsonb;

    select * into u from public.painel_mkt_publicacoes where canal_id = canal and url = link for update;
    if found then
      if u.retirada_em is not null then
        ret := ret + 1;
        continue;
      end if;
      n_alc := coalesce((vals->>'alcance')::int, u.alcance); n_imp := coalesce((vals->>'impressoes')::int, u.impressoes);
      n_eng := coalesce((vals->>'engajamento')::int, u.engajamento); n_cli := coalesce((vals->>'cliques')::int, u.cliques);
      n_lea := coalesce((vals->>'leads')::int, u.leads);
      novo_titulo := coalesce(tit, u.titulo);
      vira_api := veio and ((n_alc, n_imp, n_eng, n_cli, n_lea) is distinct from (u.alcance, u.impressoes, u.engajamento, u.cliques, u.leads)
                            or u.fonte <> 'api');
      if not vira_api and (d, novo_titulo) is not distinct from (u.data, u.titulo) then
        iguais := iguais + 1;
        continue;
      end if;
      update public.painel_mkt_publicacoes set
        data = d, titulo = novo_titulo,
        alcance = n_alc, impressoes = n_imp, engajamento = n_eng, cliques = n_cli, leads = n_lea,
        fonte = case when vira_api then 'api' else u.fonte end,
        coletado_em = case when vira_api then now() else u.coletado_em end,
        versao = u.versao + 1, atualizado_em = now(), atualizado_por = p_quem
      where id = u.id;
      atu := atu + 1;
      continue;
    end if;
    insert into public.painel_mkt_publicacoes (canal_id, data, titulo, url, alcance, impressoes, engajamento, cliques, leads,
                                              fonte, criado_por, atualizado_por)
    values (canal, d, tit, link, (vals->>'alcance')::int, (vals->>'impressoes')::int, (vals->>'engajamento')::int,
            (vals->>'cliques')::int, (vals->>'leads')::int, 'api', p_quem, p_quem);
    ins := ins + 1;
  end loop;
  return jsonb_build_object('inseridas', ins, 'atualizadas', atu, 'iguais', iguais, 'retiradas', ret, 'ignoradas', ign);
end $$;

-- ================================================= DIÁRIO E TRAVAS DA COLETA ==
-- O diário (painel_cache 'mkt_coleta_diario') e o pedido do botão
-- "Atualizar agora" ('mkt_coleta_pedidos') são uma linha só para as seis
-- fontes. Ler, juntar em memória e gravar de volta (o que as Edge Functions
-- faziam) perde escrita: duas coletas que terminam juntas leem o mesmo
-- diário e a última gravação apaga a outra; cinco cliques juntos passam
-- todos pela trava de 2 minutos; duas coletas da mesma fonte começam juntas
-- e renovam o MESMO refresh token do Pinterest duas vezes. Aqui cada uma
-- dessas operações é um passo só, sob trava (pg_advisory_xact_lock), e a
-- leitura que decide está dentro do mesmo passo que grava.

-- Anotar uma execução. A regra é a do anotarDiario de
-- _shared/mkt-fontes/coletora.mjs, escrita aqui de novo (o teste de banco
-- confere que as duas dão o mesmo diário):
--  * a entrada substitui a de mesmo id (o "andando" do começo vira a do fim);
--  * outra execução "andando" há 150 s ou mais morreu sem terminar (a Edge
--    Function cai em 150 s): vira "interrompida";
--  * a mais nova primeiro, pelo texto do início (collate "C"), e 20 por fonte;
--  * o gasto por hora (cota): a entrada que FECHA uma execução soma as
--    chamadas dela na hora UTC do início; hora com 48 h ou mais sai. É essa
--    conta que segura o teto do dia do LinkedIn e do Pinterest, e ela não
--    esquece quando as execuções passam de 20.
-- p_exclusiva (o começo da coleta): se outra execução da mesma fonte começou
-- há menos de 150 s e ainda está "andando", NÃO grava e devolve
-- {andando: true}. Senão grava e devolve {andando: false, diario} (o diário
-- novo sem as linhas de log, para a conta das chamadas do dia). Sem
-- p_exclusiva (o fim), devolve só {andando: false}.
create or replace function public.painel_mkt_coleta_anotar(p_entrada jsonb, p_exclusiva boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare janela constant interval := interval '150 seconds';
        agora timestamptz := now();
        d jsonb; e jsonb; ini timestamptz; v_fonte text; v_id text; outras jsonb := '[]'::jsonb; novo jsonb;
        cota jsonb := '{}'::jsonb; f text; horas jsonb; h text; n jsonb; hora text; gasto bigint;
begin
  if jsonb_typeof(p_entrada) is distinct from 'object' then raise exception 'Entrada do diário inválida' using errcode = '22023'; end if;
  v_fonte := p_entrada->>'fonte'; v_id := p_entrada->>'id';
  if v_fonte is null or v_fonte !~ '^[a-z_]{2,30}$' or v_id is null or length(v_id) not between 1 and 80 then
    raise exception 'Entrada do diário sem fonte ou id' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:diario', 0));
  select valor into d from public.painel_cache where chave = 'mkt_coleta_diario';
  if jsonb_typeof(d) is distinct from 'object' then d := '{}'::jsonb; end if;

  for e in select x from jsonb_array_elements(case when jsonb_typeof(d->'execucoes') = 'array' then d->'execucoes' else '[]'::jsonb end) x loop
    continue when jsonb_typeof(e) is distinct from 'object';
    continue when e->>'id' is not distinct from v_id;
    -- Início ilegível conta como "sem início" (o cast pode falhar).
    begin ini := (e->>'inicio')::timestamptz; exception when others then ini := null; end;
    if e->>'estado' = 'andando' then
      if p_exclusiva and e->>'fonte' = v_fonte and ini is not null and agora - ini < janela then
        return jsonb_build_object('andando', true);
      end if;
      if ini is null or agora - ini >= janela then
        e := e || jsonb_build_object('estado', 'interrompida',
               'erro', case when jsonb_typeof(e->'erro') = 'string' and e->>'erro' <> '' then e->'erro'
                            else to_jsonb('A execução parou sem terminar (o servidor encerrou antes do fim).'::text) end);
      end if;
    end if;
    outras := outras || jsonb_build_array(e);
  end loop;

  -- O gasto por hora, podado.
  if jsonb_typeof(d->'cota') = 'object' then
    for f, horas in select * from jsonb_each(d->'cota') loop
      continue when jsonb_typeof(horas) is distinct from 'object';
      for h, n in select * from jsonb_each(horas) loop
        continue when h !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' or jsonb_typeof(n) is distinct from 'number' or (n::text) !~ '^[1-9][0-9]{0,9}$';
        begin
          continue when agora - (h || ':00:00Z')::timestamptz >= interval '48 hours';
        exception when others then continue;
        end;
        cota := jsonb_set(cota, array[f], coalesce(cota->f, '{}'::jsonb) || jsonb_build_object(h, n));
      end loop;
    end loop;
  end if;
  hora := left(p_entrada->>'inicio', 13);
  if p_entrada->>'fim' is not null and jsonb_typeof(p_entrada->'chamadas') = 'number' and (p_entrada->>'chamadas') ~ '^[1-9][0-9]{0,6}$'
     and hora ~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    gasto := coalesce((cota->v_fonte->>hora)::bigint, 0) + (p_entrada->>'chamadas')::bigint;
    cota := jsonb_set(cota, array[v_fonte], coalesce(cota->v_fonte, '{}'::jsonb) || jsonb_build_object(hora, gasto));
  end if;

  -- A mais nova primeiro e 20 por fonte; a posição desempata (a entrada
  -- nova vem antes das outras, como no JavaScript).
  select coalesce(jsonb_agg(x order by ordem), '[]'::jsonb) into novo from (
    select x, row_number() over (order by x->>'inicio' collate "C" desc nulls last, pos) ordem,
           row_number() over (partition by x->>'fonte' order by x->>'inicio' collate "C" desc nulls last, pos) na_fonte
      from jsonb_array_elements(jsonb_build_array(p_entrada) || outras) with ordinality t(x, pos)
  ) s where na_fonte <= 20;
  novo := jsonb_build_object('versao', 1, 'execucoes', novo, 'cota', cota);

  insert into public.painel_cache (chave, valor, atualizado_em) values ('mkt_coleta_diario', novo, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em;
  if not p_exclusiva then return jsonb_build_object('andando', false); end if;
  return jsonb_build_object('andando', false, 'diario', jsonb_build_object('versao', 1, 'cota', cota,
    'execucoes', (select coalesce(jsonb_agg(x - 'log' order by pos), '[]'::jsonb) from jsonb_array_elements(novo->'execucoes') with ordinality t(x, pos))));
end $$;

-- O pedido do botão "Atualizar agora": um por fonte a cada p_intervalo_s,
-- para todo mundo. A conferência e a marca são um passo só (antes, cinco
-- cliques juntos liam todos o estado de antes e passavam), e a marca mexe
-- só na chave daquela fonte (antes, o objeto inteiro era regravado, e o
-- pedido de outra fonte feito junto sumia). Devolve {ok: true} ou
-- {ok: false, aguardar_s}.
create or replace function public.painel_mkt_coleta_pedir(p_fonte text, p_quem text, p_intervalo_s integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d jsonb; ultimo timestamptz; libera timestamptz;
begin
  if p_fonte is null or p_fonte !~ '^[a-z_]{2,30}$' then raise exception 'Fonte inválida' using errcode = '22023'; end if;
  if p_intervalo_s is null or p_intervalo_s not between 1 and 3600 then raise exception 'Intervalo fora de 1 a 3600 s' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:mkt:pedidos', 0));
  select valor into d from public.painel_cache where chave = 'mkt_coleta_pedidos';
  if jsonb_typeof(d) is distinct from 'object' then d := '{}'::jsonb; end if;
  begin ultimo := (d->p_fonte->>'em')::timestamptz; exception when others then ultimo := null; end;
  if ultimo is not null then
    libera := ultimo + make_interval(secs => p_intervalo_s);
    if now() < libera then
      return jsonb_build_object('ok', false, 'aguardar_s', least(p_intervalo_s, greatest(1, ceil(extract(epoch from (libera - now())))::int)));
    end if;
  end if;
  insert into public.painel_cache (chave, valor, atualizado_em)
  values ('mkt_coleta_pedidos', jsonb_build_object(p_fonte, jsonb_build_object('em', now(), 'por', left(coalesce(p_quem, ''), 80))), now())
  on conflict (chave) do update
    set valor = (case when jsonb_typeof(painel_cache.valor) = 'object' then painel_cache.valor else '{}'::jsonb end) || excluded.valor,
        atualizado_em = excluded.atualizado_em;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ FAXINA ==
-- Regra de guarda do LinkedIn (pesquisa, contraprova): números de relatório
-- da Página por até 1 ano; texto de post por até 6 meses. Só o coletor do
-- LinkedIn chama, com o código do canal ('linkedin').
--
-- A ORIGEM É GUARDADA POR NÚMERO (numeros_api, ver "A ORIGEM DE CADA
-- NÚMERO"), e é por ela que a faxina escolhe, nunca pela fonte da linha. A
-- versão de 11/10 escolhia pela linha e errava dos dois lados (segunda
-- revisão): apagava o seguidores que a Ana digitou numa semana que a API
-- tomou (a linha era 'api'), e deixava para sempre os números do LinkedIn
-- numa semana ou num post em que a Ana acrescentou leads (a linha virou
-- 'manual'). Agora:
--  * semanas: nas linhas cuja SEGUNDA-FEIRA é mais velha que p_dias_numeros,
--    somem os números que a API gravou entre os que o LinkedIn mede
--    (seguidores, alcance, impressoes, engajamento, cliques). O número de
--    gente fica. A linha só é apagada quando não sobra número nenhum; quando
--    sobra, e nenhum dos que sobraram é da API, ela volta a ser 'manual'.
--    Contar pela semana (e não pela data da coleta) é o lado seguro: a
--    coleta vem sempre depois da semana. E como a coletora só regrava as 8
--    últimas semanas, número apagado não volta;
--  * publicações: nas de data mais velha que p_dias_numeros, somem os
--    números do post que a API gravou (alcance, impressoes, engajamento,
--    cliques), que são relatório da Página. Ficam o link, a data, os leads e
--    todo número digitado. O conector só relê os posts dos últimos 60 dias: o
--    número de um post de mais de um ano não volta;
--  * título: zera o título das publicações com fonte 'api' mais velhas que
--    p_dias_titulo. A COLETORA DO LINKEDIN PASSA NULO AQUI: a API dele nunca
--    manda título (regra de guarda de conteúdo), então todo título numa
--    publicação dele foi digitado por gente, e a regra do provedor não o
--    alcança. A parte fica para uma fonte que mande título;
--  * O LOG TAMBÉM: o gatilho de auditoria guarda o antes e o depois de toda
--    gravação, inclusive a da própria faxina. Apagar o número e deixar a
--    cópia no log não cumpriria a regra. Por isso, em TODAS as semanas e
--    publicações velhas do canal, sai do antes e do depois de cada linha de
--    log o número que aquela cópia diz que a API gravou (o numeros_api da
--    própria cópia, painel_mkt_sem_numeros_api). O número que a pessoa
--    digitou continua no log, até na linha em que a API o trocou (no antes).
--    E todas as velhas, não só as que a faxina mexeu agora: a semana em que a
--    Ana digitou por cima do número da API não tem mais número da API na
--    tabela, mas o log dela ainda tinha. Fica uma linha de resumo (sem número
--    nem título) dizendo que a faxina rodou, quando ela mexeu em algo. Backup
--    que já foi feito continua com o dado: o banco não alcança a cópia.
--  * N nulo deixa aquela parte quieta. N fora de 1 a 3650 é erro: um zero ou
--    um negativo por engano apagaria tudo de uma vez.
--  * Canal que não existe não é erro (não há o que limpar, e a coletora
--    chama em toda execução do LinkedIn): devolve "ignorada".
-- Devolve {canal, numeros_apagados (semanas), publicacoes_limpas,
-- titulos_zerados}.
create or replace function public.painel_mkt_api_faxina(p_canal text, p_dias_numeros integer, p_dias_titulo integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare canal uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        medidas constant text[] := array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques'];
        do_post constant text[] := array['alcance', 'impressoes', 'engajamento', 'cliques'];
        da_semana constant text[] := array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'];
        velhas_semanas text[] := '{}'; semanas text[] := '{}'; pubs text[] := '{}'; velhas text[] := '{}';
        n_num int := 0; n_pub int := 0; n_tit int := 0;
begin
  if p_dias_numeros is not null and p_dias_numeros not between 1 and 3650 then
    raise exception 'Dias de guarda dos números fora de 1 a 3650' using errcode = '22023';
  end if;
  if p_dias_titulo is not null and p_dias_titulo not between 1 and 3650 then
    raise exception 'Dias de guarda do título fora de 1 a 3650' using errcode = '22023';
  end if;
  select c.id into canal from public.painel_mkt_canais c where c.codigo = p_canal;
  if not found then
    return jsonb_build_object('canal', left(p_canal, 60), 'ignorada', 'canal_inexistente');
  end if;
  perform set_config('painel.quem', 'faxina', true);
  perform set_config('painel.motivo', 'Regra de guarda do provedor', true);

  if p_dias_numeros is not null then
    -- Todas as semanas velhas do canal (o log de todas passa pela limpeza) e,
    -- delas, as que ainda guardam número do LinkedIn gravado pela API.
    select coalesce(array_agg(id::text), '{}') into velhas_semanas from public.painel_mkt_metricas_canal
     where canal_id = canal and semana < hoje - p_dias_numeros;
    select coalesce(array_agg(id::text), '{}') into semanas from public.painel_mkt_metricas_canal
     where id::text = any(velhas_semanas) and numeros_api && medidas;
    n_num := cardinality(semanas);
    if n_num > 0 then
      -- Não sobra número que não seja do LinkedIn pela API: a linha sai inteira.
      delete from public.painel_mkt_metricas_canal x
       where x.id::text = any(semanas)
         and not exists (select 1 from unnest(da_semana) k
                          where to_jsonb(x)->>k is not null and not (k = any(x.numeros_api) and k = any(medidas)));
      -- As outras perdem só esses números (a lista diz quais) e ficam com os de gente.
      update public.painel_mkt_metricas_canal x set
        seguidores = case when 'seguidores' = any(x.numeros_api) then null else x.seguidores end,
        alcance = case when 'alcance' = any(x.numeros_api) then null else x.alcance end,
        impressoes = case when 'impressoes' = any(x.numeros_api) then null else x.impressoes end,
        engajamento = case when 'engajamento' = any(x.numeros_api) then null else x.engajamento end,
        cliques = case when 'cliques' = any(x.numeros_api) then null else x.cliques end,
        numeros_api = array(select k from unnest(x.numeros_api) k where not (k = any(medidas)) order by k),
        fonte = case when exists (select 1 from unnest(x.numeros_api) k where not (k = any(medidas))) then x.fonte else 'manual' end,
        versao = x.versao + 1, atualizado_em = now(), atualizado_por = 'faxina'
       where x.id::text = any(semanas);
    end if;
    -- Depois do apagar e do zerar: as linhas de log que eles mesmos acabaram
    -- de criar também perdem os números.
    if cardinality(velhas_semanas) > 0 then
      update public.painel_mkt_log set
        antes = public.painel_mkt_sem_numeros_api(antes, medidas),
        depois = public.painel_mkt_sem_numeros_api(depois, medidas)
       where tabela = 'painel_mkt_metricas_canal' and registro_id = any(velhas_semanas)
         and (antes is distinct from public.painel_mkt_sem_numeros_api(antes, medidas)
              or depois is distinct from public.painel_mkt_sem_numeros_api(depois, medidas));
    end if;

    -- Publicações velhas do canal: as que ainda têm número do post gravado
    -- pela API perdem esses números; o log de todas é limpo.
    select coalesce(array_agg(id::text), '{}') into velhas from public.painel_mkt_publicacoes
     where canal_id = canal and data < hoje - p_dias_numeros;
    if cardinality(velhas) > 0 then
      with limpas as (
        update public.painel_mkt_publicacoes x set
          alcance = case when 'alcance' = any(x.numeros_api) then null else x.alcance end,
          impressoes = case when 'impressoes' = any(x.numeros_api) then null else x.impressoes end,
          engajamento = case when 'engajamento' = any(x.numeros_api) then null else x.engajamento end,
          cliques = case when 'cliques' = any(x.numeros_api) then null else x.cliques end,
          numeros_api = array(select k from unnest(x.numeros_api) k where not (k = any(do_post)) order by k),
          versao = x.versao + 1, atualizado_em = now(), atualizado_por = 'faxina'
         where x.id::text = any(velhas) and x.numeros_api && do_post
        returning x.id
      ) select count(*) into n_pub from limpas;
      update public.painel_mkt_log set
        antes = public.painel_mkt_sem_numeros_api(antes, do_post),
        depois = public.painel_mkt_sem_numeros_api(depois, do_post)
       where tabela = 'painel_mkt_publicacoes' and registro_id = any(velhas)
         and (antes is distinct from public.painel_mkt_sem_numeros_api(antes, do_post)
              or depois is distinct from public.painel_mkt_sem_numeros_api(depois, do_post));
    end if;
  end if;

  if p_dias_titulo is not null then
    with zeradas as (
      update public.painel_mkt_publicacoes set titulo = null, versao = versao + 1, atualizado_em = now(), atualizado_por = 'faxina'
       where canal_id = canal and fonte = 'api' and data < hoje - p_dias_titulo and titulo is not null
      returning id
    ) select count(*) into n_tit from zeradas;
    -- Todas as publicações da regra, e não só as zeradas agora: a que já
    -- estava sem título pode ter o título antigo no log.
    select coalesce(array_agg(id::text), '{}') into pubs from public.painel_mkt_publicacoes
     where canal_id = canal and fonte = 'api' and data < hoje - p_dias_titulo;
    if cardinality(pubs) > 0 then
      update public.painel_mkt_log set
        antes = case when antes ? 'titulo' then jsonb_set(antes, '{titulo}', 'null'::jsonb) else antes end,
        depois = case when depois ? 'titulo' then jsonb_set(depois, '{titulo}', 'null'::jsonb) else depois end
       where tabela = 'painel_mkt_publicacoes' and registro_id = any(pubs)
         and (jsonb_typeof(antes->'titulo') = 'string' or jsonb_typeof(depois->'titulo') = 'string');
    end if;
  end if;

  if n_num + n_pub + n_tit > 0 then
    insert into public.painel_mkt_log (quem, tabela, registro_id, operacao, antes, depois, motivo)
    values ('faxina', 'painel_mkt_canais', canal::text, 'faxina', null,
            jsonb_build_object('numeros_apagados', n_num, 'publicacoes_limpas', n_pub, 'titulos_zerados', n_tit,
                               'dias_numeros', p_dias_numeros, 'dias_titulo', p_dias_titulo),
            'Regra de guarda do provedor');
  end if;
  return jsonb_build_object('canal', p_canal, 'numeros_apagados', n_num, 'publicacoes_limpas', n_pub, 'titulos_zerados', n_tit);
end $$;

-- =========================================================== LOG DA COLETA ==
-- O gatilho de auditoria (painel_mkt_registrar, da a1 e da a2) guarda o antes
-- e o depois de TODA gravação. A coleta diária regrava publicações e semanas
-- cujos números sobem todo dia: o Pinterest manda até 2.000 Pins com as
-- impressões desde sempre, a Meta até 260 posts dos últimos 90 dias. Cada
-- número que subiu virava uma linha de log com a linha inteira (cerca de
-- 1 KB): centenas por dia, só de máquina, enterrando as edições de gente, e a
-- painel_mkt_exportar leva o log inteiro em todo backup.
-- O que deixa de ir para o log: a REGRAVAÇÃO, pela coleta (motivo 'Coleta da
-- API'), de número que já era da API, numa linha que era e continua 'api',
-- quando só mudaram esses números e os carimbos (coletado_em, versão,
-- atualizado_em/por e a própria lista numeros_api).
-- Continua indo: a linha nova; a linha manual que a API passou a medir; e
-- TODA troca de um número que veio de gente (fonte manual ou csv), mesmo
-- numa linha que já era 'api'. Quem diz de quem é cada número é a lista
-- numeros_api do ANTES (ver "A ORIGEM DE CADA NÚMERO"). A versão de 11/10
-- olhava só a fonte da linha, e a segunda revisão achou a troca calada: a
-- Ana lança 40 cliques numa semana do site que a coleta do GA4 já tinha
-- tomado, e o Search Console troca por 55 sem deixar linha; os leads=5 dela
-- viravam 0 do mesmo jeito. E qualquer mudança de data, título, link ou canal.
-- O resto da função é o da a2, sem mudança.
create or replace function public.painel_mkt_registrar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        numeros constant text[] := array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'];
        carimbos constant text[] := array['coletado_em', 'versao', 'atualizado_em', 'atualizado_por', 'numeros_api'];
begin
  if tg_op = 'UPDATE' and tg_table_name in ('painel_mkt_publicacoes', 'painel_mkt_metricas_canal')
     and current_setting('painel.motivo', true) = 'Coleta da API'
     and antes->>'fonte' = 'api' and depois->>'fonte' = 'api'
     and (antes - numeros - carimbos) = (depois - numeros - carimbos)
     -- e todo número que mudou já era da API antes da troca
     and not exists (select 1 from unnest(numeros) k
                      where (antes->k) is distinct from (depois->k)
                        and not coalesce(jsonb_typeof(antes->'numeros_api') = 'array' and (antes->'numeros_api') ? k, false)) then
    return null;
  end if;
  -- Toda gravação deixa linha, inclusive a volta de um backup (com o motivo
  -- "Volta do backup") e a carga padrão.
  insert into public.painel_mkt_log (quem, tabela, registro_id, operacao, antes, depois, motivo)
  values (nullif(current_setting('painel.quem', true), ''), tg_table_name,
          coalesce(depois->>'id', depois->>'orcamento_id', depois->>'id_pessoa', antes->>'id', antes->>'orcamento_id', antes->>'id_pessoa'),
          lower(tg_op), antes, depois, nullif(current_setting('painel.motivo', true), ''));
  return null;
end $$;

-- ================================================================ GRANTS ==
-- O gatilho da origem e o ajudante da faxina não são porta de ninguém: quem
-- os chama é o banco, dentro das funções acima. Saem de public, anon e
-- authenticated como todas, e não ganham grant novo.
revoke all on function public.painel_mkt_conexao_gravar(text, jsonb), public.painel_mkt_conexao_ler(text),
  public.painel_mkt_conexao_info(), public.painel_mkt_conexao_apagar(text),
  public.painel_mkt_conexao_regravar(text, jsonb, jsonb), public.painel_mkt_conexao_pedido(text, text, text, text, integer),
  public.painel_mkt_conexao_consumir(text),
  public.painel_mkt_conexao_pendente(text, text, text, jsonb, integer), public.painel_mkt_conexao_confirmar(text, text, text),
  public.painel_mkt_api_metricas(jsonb, text), public.painel_mkt_api_publicacoes(jsonb, text),
  public.painel_mkt_api_faxina(text, integer, integer),
  public.painel_mkt_coleta_anotar(jsonb, boolean), public.painel_mkt_coleta_pedir(text, text, integer),
  public.painel_mkt_origem_numeros(), public.painel_mkt_sem_numeros_api(jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.painel_mkt_conexao_gravar(text, jsonb), public.painel_mkt_conexao_ler(text),
  public.painel_mkt_conexao_info(), public.painel_mkt_conexao_apagar(text),
  public.painel_mkt_conexao_regravar(text, jsonb, jsonb), public.painel_mkt_conexao_pedido(text, text, text, text, integer),
  public.painel_mkt_conexao_consumir(text),
  public.painel_mkt_conexao_pendente(text, text, text, jsonb, integer), public.painel_mkt_conexao_confirmar(text, text, text),
  public.painel_mkt_api_metricas(jsonb, text), public.painel_mkt_api_publicacoes(jsonb, text),
  public.painel_mkt_api_faxina(text, integer, integer),
  public.painel_mkt_coleta_anotar(jsonb, boolean), public.painel_mkt_coleta_pedir(text, text, integer)
  to service_role;

-- =========================================================== AGENDAMENTO ==
-- Uma coleta por fonte, todo dia, uma a cada 6 minutos entre 09:05 e 09:35
-- UTC (06:05 a 06:35 em Brasília): depois do backup (08:40) e fora dos
-- minutos dos vigias (12, 13, 33 e 53 de toda hora). Escalonar é para as
-- seis não disputarem a mesma Edge Function nem o mesmo minuto do banco.
-- Os jobs: painel-mkt-fonte-site, painel-mkt-fonte-google,
-- painel-mkt-fonte-meta, painel-mkt-fonte-google_ads,
-- painel-mkt-fonte-linkedin e painel-mkt-fonte-pinterest.
--
-- timeout_milliseconds explícito: o padrão do pg_net é 5 s, e a coletora
-- trabalha até 110 s. Com 5 s, o pg_net desistia e registrava falha de uma
-- coleta que ainda estava andando (o "succeeded" do pg_cron só diz que o
-- pedido saiu). 140 s cobre os 110 s com folga e fica abaixo dos 150 s em
-- que a Edge Function é derrubada.
--
-- unschedule antes de schedule, só quando o job existe: a migração pode
-- rodar duas vezes sem erro e sem job repetido.
do $$
declare j record;
begin
  for j in select * from (values
    ('site',       '5 9 * * *'),
    ('google',     '11 9 * * *'),
    ('meta',       '17 9 * * *'),
    ('google_ads', '23 9 * * *'),
    ('linkedin',   '29 9 * * *'),
    ('pinterest',  '35 9 * * *')
  ) as v(fonte, quando) loop
    perform cron.unschedule(c.jobname) from cron.job c where c.jobname = 'painel-mkt-fonte-' || j.fonte;
    perform cron.schedule('painel-mkt-fonte-' || j.fonte, j.quando, format($cmd$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- lido do Vault na hora de rodar: nunca fica escrito no repositório
      'x-token', (select decrypted_secret from vault.decrypted_secrets where name = 'painel_token')
    ),
    body := %L::jsonb,
    timeout_milliseconds := 140000
  );
  $cmd$, 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-fontes',
         jsonb_build_object('action', 'coletar', 'fonte', j.fonte)::text));
  end loop;
end $$;

-- A GUARDA DO LOG DA COLETA. Mesmo sem as regravações de número da API (ver
-- painel_mkt_registrar acima), a coleta deixa no log a publicação nova, a
-- linha manual que a API passou a medir e a troca de número de gente. As
-- linhas só de máquina ficam 1 ano (a mesma régua da guarda do LinkedIn) e
-- depois saem, para o log, que vai inteiro em todo backup, não crescer sem
-- teto. FICA a linha em que a coleta trocou um número que alguém tinha
-- lançado (o antes tem o número, ele mudou e não era da API): é a única
-- prova de quando o número da pessoa saiu, e são poucas (uma por número
-- digitado). As linhas de gente (outro motivo) não são tocadas. Todo dia às
-- 09:41 UTC, depois das seis coletas.
do $$
begin
  perform cron.unschedule(c.jobname) from cron.job c where c.jobname = 'painel-mkt-log-coleta';
  perform cron.schedule('painel-mkt-log-coleta', '41 9 * * *',
    $cmd$delete from public.painel_mkt_log l
  where l.motivo = 'Coleta da API' and l.em < now() - interval '365 days'
    and not (l.operacao = 'update' and exists (
      select 1 from unnest(array['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads']) k
       where l.antes->>k is not null and (l.antes->k) is distinct from (l.depois->k)
         and not coalesce(jsonb_typeof(l.antes->'numeros_api') = 'array' and (l.antes->'numeros_api') ? k, false)))$cmd$);
end $$;

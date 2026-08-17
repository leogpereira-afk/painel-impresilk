-- O FREIO QUE SEGURA RAJADA.
--
-- O ANTERIOR CONTAVA O QUE JA TINHA SIDO GRAVADO: "ja houve 8 falhas nos
-- ultimos 15 minutos?". Contra gente digitando errado funcionava. Contra script
-- nao: em 17/08/2026 as 10:48:20 chegaram 16 tentativas DENTRO DO MESMO SEGUNDO
-- na porta do PCP. As 16 perguntaram "ja teve 8 falhas?", as 16 leram zero, as
-- 16 passaram -- e so depois cada uma gravou a propria falha. A trava engatou
-- quando a rajada ja tinha acabado.
--
-- A CORRECAO E DE FORMA, NAO DE NUMERO: a ficha e consumida NA MESMA operacao
-- que confere. Um UPDATE que incrementa e devolve o novo valor serializa as
-- chamadas paralelas no lock da linha -- a 11a espera a 10a terminar, ve 11 e e
-- barrada. Aumentar o limite nao resolveria nada; o defeito era ler antes de
-- escrever.
--
-- CONTA TENTATIVA, NAO FALHA. Contar falha obriga a saber o resultado, e ai a
-- decisao ja veio tarde. Entrada certa ZERA o contador (em porta_registrar),
-- entao quem sabe a senha nunca acumula: erra duas, acerta na terceira, volta a
-- zero.
--
-- FALHA ABERTO, DE PROPOSITO. Se o banco engasgar, a funcao devolve "nao
-- travada". Trancar a casa inteira por causa de um erro de infraestrutura custa
-- mais do que deixar passar uma rajada -- e essa e a mesma regra de
-- acesso_revogado.

create table if not exists public.porta_freio (
  sistema    text        not null,
  usuario    text        not null,
  janela_em  timestamptz not null default now(),
  tentativas integer     not null default 0,
  primary key (sistema, usuario)
);

comment on table public.porta_freio is
  'Fichas de tentativa por (sistema, usuario). Consumidas por porta_travada e zeradas por porta_registrar quando a acao e "entrou".';

create or replace function public.porta_travada(p_sistema text, p_usuario text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_limite  constant integer  := 10;
  v_janela  constant interval := interval '15 minutes';
  v_usuario text := lower(coalesce(p_usuario, ''));
  v_tent    integer;
begin
  -- O insert ... on conflict do update ... returning e UMA operacao: o lock da
  -- linha serializa as chamadas concorrentes, e cada uma le o proprio numero.
  insert into public.porta_freio as f (sistema, usuario, janela_em, tentativas)
  values (coalesce(p_sistema, '-'), v_usuario, now(), 1)
  on conflict (sistema, usuario) do update
     set tentativas = case when f.janela_em < now() - v_janela then 1
                           else f.tentativas + 1 end,
         janela_em  = case when f.janela_em < now() - v_janela then now()
                           else f.janela_em end
  returning f.tentativas into v_tent;

  return v_tent > v_limite;
exception when others then
  -- Ver "FALHA ABERTO" no topo.
  return false;
end;
$fn$;

create or replace function public.porta_registrar(
  p_sistema text, p_usuario text, p_acao text, p_por text default null, p_detalhe text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_usuario text := lower(coalesce(p_usuario, ''));
begin
  /* DOIS EFEITOS INDEPENDENTES, DOIS BLOCOS. Na primeira versao os dois moravam
     no mesmo `begin/exception`, e o resultado foi: `por` e `detalhe` sao NOT
     NULL com padrao '' -- passar NULL explicito viola a restricao --, o insert
     estourou, o `exception when others` engoliu, e a ZERAGEM nunca rodou. O
     efeito pratico seria o pior possivel: quem entrasse certo continuaria
     acumulando tentativas ate ser trancado do lado de fora, sem nada no log
     dizendo por que. Um bloco por efeito e o que impede isso. */
  begin
    insert into public.equipe_acessos_log (sistema, usuario, acao, por, detalhe)
    values (p_sistema, v_usuario, p_acao, coalesce(p_por, ''), coalesce(p_detalhe, ''));
  exception when others then
    null;
  end;
  -- A zeragem NAO mora aqui: mora no gatilho da tabela. Ver abaixo.
end;
$fn$;

/* A ZERAGEM MORA NO GATILHO, NAO NA FUNCAO -- e a diferenca nao e estilo.
   Das quatro portas, so tres chamam `porta_registrar`. A `equipe-auth`, que
   atende Brief, PCP, Compras, DRE e POPs, grava o log DIRETO na tabela
   (`sb.from("equipe_acessos_log").insert(...)`). Se a zeragem morasse na
   funcao, essas cinco nunca zerariam: quem entrasse certo continuaria
   acumulando tentativas ate ser trancado do lado de fora -- exatamente a gente
   que trabalha na rua, e sem nada explicando por que.
   No gatilho, a regra vale para QUEM ESCREVER, por qualquer caminho. */
create or replace function public.porta_freio_zerar()
returns trigger
language plpgsql
security definer
set search_path = public
as $tg$
begin
  if new.acao = 'entrou' then
    delete from public.porta_freio
     where sistema = coalesce(new.sistema, '-')
       and usuario = lower(coalesce(new.usuario, ''));
  end if;
  return null;   -- AFTER trigger: o retorno e ignorado
exception when others then
  return null;   -- entrar nunca pode falhar por causa do freio
end;
$tg$;

drop trigger if exists porta_freio_zerar_no_entrou on public.equipe_acessos_log;
create trigger porta_freio_zerar_no_entrou
after insert on public.equipe_acessos_log
for each row execute function public.porta_freio_zerar();

-- Faxina do que envelheceu, para a tabela nao crescer sozinha.
create index if not exists porta_freio_janela on public.porta_freio (janela_em);

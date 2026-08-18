-- O BALDE DA ENTRADA UNICA TAMBEM TEM DE ZERAR.
--
-- Achado da auditoria de 18/08/2026. O freio conta TENTATIVA (nao falha), e a
-- entrada unica consome ficha no balde '*' -- porque ali ainda nao se sabe em
-- que sistema a pessoa vai entrar. Mas o registro de sucesso e gravado POR
-- SISTEMA ('entrou' em painel, brief, pops...), e o gatilho so apagava a linha
-- do MESMO sistema do evento.
--
-- Resultado: nenhum 'entrou' jamais tinha sistema='*', entao o balde da entrada
-- unica so crescia. Login CERTO tambem consumia ficha e nunca devolvia. Depois
-- de 10 entradas em 15 minutos a pessoa era barrada com a senha correta, na
-- porta que a casa inteira usa. Ja estava acontecendo: candida em 5 de 10.
--
-- Entrar certo em QUALQUER sistema prova que a pessoa e ela; entao zera o balde
-- daquele sistema E o da entrada unica.
create or replace function public.porta_freio_zerar()
returns trigger
language plpgsql
security definer
set search_path = public
as $tg$
begin
  if new.acao = 'entrou' then
    delete from public.porta_freio
     where usuario = lower(coalesce(new.usuario, ''))
       and sistema in (coalesce(new.sistema, '-'), '*');
  end if;
  return null;
exception when others then
  return null;   -- entrar nunca pode falhar por causa do freio
end;
$tg$;

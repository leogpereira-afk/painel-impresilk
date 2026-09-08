-- CONTRATO APAGADO FECHA A PORTA -- e a tela de pendencias volta a enxergar o
-- prazo que mora no contrato.
--
-- Achado 47 da auditoria de codigo do RH (07/09/2026), o unico que tinha ficado
-- aberto: apagar o contrato do freelancer no RH deixava a conta dele na Central
-- SEM PRAZO NENHUM. Como terceirizado nao obedece a ficha (por desenho: quem
-- vira terceirizado quase sempre saiu da folha), a conta ficava aberta para
-- sempre -- exatamente o "acesso esquecido vira porta aberta" que o resto deste
-- desenho passou o dia 18/08 fechando.
--
-- Duas correcoes, as duas na mesma familia "uma regra, um lugar":
--   1) acesso_revogado: conta que aponta para contrato que sumiu, e sem data
--      propria, esta sem prazo -- e sem prazo o terceirizado nao entra.
--   2) acesso_pendencias: a view lia `valido_ate` cru; agora usa
--      acesso_valido_ate(), a MESMA funcao que a regra usa, e ganha o caso novo.
--      Para conta ligada a contrato essa coluna e nula (a data mora no
--      contrato), entao "prazo vence em breve" nunca aparecia justamente para
--      quem depende dela: a tela silenciava sobre o unico caso que ela existe
--      para avisar.
--
-- Conferido ANTES de aplicar: zero contas do tipo terceirizado hoje (ninguem e
-- afetado agora) e as 273 respostas de acesso_revogado para todos os usuarios
-- conhecidos, nos 7 sistemas, continuaram identicas depois.

create or replace function public.acesso_revogado(p_sistema text, p_sub text, p_papel text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_norm text := lower(regexp_replace(translate(coalesce(p_sub,''),
      'ÇçÁÀÃÂÉÊÍÓÔÕÚÜáàãâéêíóôõúü','CcAAAAEEIOOOUUaaaaeeiooouu'), '\s+', ' ', 'g'));
  v_tem_conta boolean := false;
  v_conta_ativa boolean := true;
  v_pessoa_ativa boolean;
  v_papel_ativo boolean;
  v_achou_pessoa boolean := false;
  v_fora_da_lista boolean;
  v_lista_tem_gente boolean;
  v_tipo text;
  v_valido_ate date;
  v_ficha text;
  v_situacao text;
  v_freela text;
  v_encerrado boolean;
  v_fim_contrato date;
  v_achou_contrato boolean := false;
begin
  if coalesce(p_sub,'') = '' then return false; end if;

  -- 1) CONTA NO PROPRIO SISTEMA
  if p_sistema = 'painel' then
    select true into v_tem_conta from painel_contas
     where lower(regexp_replace(usuario,'\s+',' ','g')) = v_norm limit 1;
  elsif p_sistema = 'rh' then
    select true into v_tem_conta from perfis
     where lower(regexp_replace(usuario,'\s+',' ','g')) = v_norm limit 1;
  else
    select true, ativo into v_tem_conta, v_conta_ativa from equipe_contas
     where sistema = p_sistema
       and lower(regexp_replace(usuario,'\s+',' ','g')) = v_norm limit 1;
  end if;
  v_tem_conta := coalesce(v_tem_conta, false);
  if v_tem_conta and coalesce(v_conta_ativa, true) = false then
    return true;
  end if;

  -- 2) O QUADRO UNICO -- e onde o botao "desativar" da tela sempre grava.
  select c.ativo, coalesce(p.ativo, true), c.tipo, c.valido_ate, c.colaborador_id, c.freelancer_id
    into v_pessoa_ativa, v_papel_ativo, v_tipo, v_valido_ate, v_ficha, v_freela
    from acesso_conta c
    left join acesso_papel p on p.conta_id = c.id and p.sistema = p_sistema
   where lower(regexp_replace(c.usuario,'\s+',' ','g')) = v_norm
      or lower(regexp_replace(coalesce(c.colaborador,''),'\s+',' ','g')) = v_norm
      or lower(regexp_replace(coalesce(p.login,''),'\s+',' ','g')) = v_norm
   limit 1;
  v_achou_pessoa := found;
  if v_achou_pessoa and (v_pessoa_ativa = false or v_papel_ativo = false) then
    return true;
  end if;

  /* 4) PRAZO VENCIDO DO TERCEIRIZADO. Ele nao tem RH que o desligue, entao o
        proprio acesso tem data de fim. Vencido, a porta fecha sozinha -- sem
        depender de alguem lembrar. */
  if v_achou_pessoa and v_tipo = 'terceirizado' then
    /* A DATA VEM DO CONTRATO quando ele existe -- ordem do Leonardo em
       18/08/2026: "tem que ser apenas um". Antes a Central guardava uma copia
       de `contratoFim`, e duas datas para o mesmo fato e o comeco de toda
       divergencia: uma envelhece e ninguem descobre qual.
       Renovou no RH? A porta reabre sozinha. Encerrou? Fecha na hora, sem
       esperar o relogio -- encerrar e decisao de alguem. */
    select r.registro->>'situacao' = 'encerrado',
           nullif(r.registro->>'contratoFim','')::date
      into v_encerrado, v_fim_contrato
      from registros r
     where r.colecao = 'freelancers' and r.id = v_freela and not r.apagado
     limit 1;
    v_achou_contrato := found;
    if coalesce(v_encerrado, false) then return true; end if;
    v_valido_ate := coalesce(v_fim_contrato, v_valido_ate);
    /* CONTRATO APAGADO FECHA A PORTA (07/09/2026). Apagar o contrato no RH
       deixava a conta SEM PRAZO NENHUM -- e, como terceirizado nao obedece a
       ficha (regra logo abaixo), ela ficava aberta para sempre. Era o furo mais
       silencioso do desenho: a tela do RH ate sugere "prefira encerrado", mas
       quem apaga nao via consequencia nenhuma.
       Aqui a AUSENCIA do contrato e a prova, e nao um palpite: a trava de
       escrita (acesso_conta_terceirizado_prazo) exige que todo terceirizado
       tenha contrato OU data propria; sem os dois nao ha prazo, e prazo e o
       unico freio que o terceirizado tem. Fecha so quem NAO tem data propria --
       conta com `valido_ate` continua valendo pela data dela. */
    if coalesce(v_freela, '') <> '' and not v_achou_contrato and v_valido_ate is null then
      return true;
    end if;
    if v_valido_ate is not null and v_valido_ate < current_date then
      return true;
    end if;
  end if;

  /* 5) DESLIGADO NO RH. E o que o desenho promete: a ficha manda. So vale com
        VINCULO EXPLICITO (`colaborador_id`) e com a ficha dizendo, em letras,
        que a pessoa saiu -- `inativo` ou `abandono`.
        Ficha ausente, apagada ou sem situacao ACEITA, pela mesma regra de ouro
        das outras: so recusar com prova. Trancar por ausencia derrubaria quem
        entrou por um caminho que nao amarra ficha (terceirizado, conta de
        funcao), e o prejuizo de trancar a casa e maior que o de um cracha durar
        ate expirar. */
  /* TERCEIRIZADO NAO OBEDECE A FICHA -- e nao e excecao, e a definicao dele.
     Quem vira terceirizado quase sempre SAIU da folha: a ficha marcada `inativo`
     e o estado normal, nao a prova de que perdeu o acesso. O Osmane e o caso
     real: desligado em 22/06/2026 e trabalhando por fora desde entao, com 24
     O.S. no PCP. Sem esta guarda, cadastra-lo como terceirizado tirava o acesso
     dele no mesmo instante -- conferido antes de escrever isto.
     Quem manda no terceirizado e o PRAZO (regra 4), que e obrigatorio para ele
     justamente porque nao ha RH para encerra-lo. */
  if v_achou_pessoa and v_tipo = 'terceirizado' then
    return false;
  end if;

  if v_achou_pessoa and coalesce(v_ficha,'') <> '' then
    select r.registro->>'statusId' into v_situacao
      from registros r
     where r.colecao = 'colaboradores' and r.id = v_ficha and not r.apagado
     limit 1;
    if v_situacao in ('inativo', 'abandono') then
      return true;
    end if;
  end if;

  -- 3) PCP, TOQUE NO NOME. So para quem NAO tem conta.
  if p_sistema = 'pcp' and p_papel = 'montagem' and not v_tem_conta then
    select jsonb_array_length(coalesce(config->'instaladores','[]'::jsonb)) > 0
      into v_lista_tem_gente from pcp_config_global where id = true;
    select not exists (
      select 1 from pcp_config_global,
             jsonb_array_elements_text(coalesce(config->'instaladores','[]'::jsonb)) n
       where id = true
         and lower(regexp_replace(translate(n,'ÇçÁÀÃÂÉÊÍÓÔÕÚÜáàãâéêíóôõúü','CcAAAAEEIOOOUUaaaaeeiooouu'),'\s+',' ','g')) = v_norm
    ) into v_fora_da_lista;
    if coalesce(v_lista_tem_gente,false) and coalesce(v_fora_da_lista,false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

/* O VIGIA DO DESLIGAMENTO. A regra 5 ja FECHA a porta sozinha; esta view existe
   para a tela poder DIZER isso -- acesso que fechou sem ninguem mexer e acesso
   que some sem explicacao, e ai a pessoa liga reclamando e ninguem sabe por que.
   Traz tambem o caso que a regra 5 nao alcanca: conta sem vinculo com ficha. */
create or replace view public.acesso_pendencias as
select
  c.usuario,
  c.nome,
  c.tipo,
  c.colaborador_id,
  f.registro->>'nome'     as nome_na_ficha,
  f.registro->>'statusId' as situacao_no_rh,
  public.acesso_valido_ate(c) as valido_ate,
  case
    when c.tipo = 'terceirizado' and coalesce(c.freelancer_id,'') <> ''
         and not exists (select 1 from registros r
                          where r.colecao = 'freelancers' and r.id = c.freelancer_id and not r.apagado)
      then 'contrato do freelancer sumiu -- acesso fechado'
    when c.tipo = 'terceirizado' and public.acesso_valido_ate(c) is not null
         and public.acesso_valido_ate(c) < current_date
      then 'prazo vencido'
    when c.tipo = 'terceirizado' and public.acesso_valido_ate(c) is not null
         and public.acesso_valido_ate(c) < current_date + 15
      then 'prazo vence em breve'
    when coalesce(c.colaborador_id,'') <> '' and f.id is null
      then 'ficha sumiu do RH'
    when f.registro->>'statusId' in ('inativo','abandono')
      then 'desligado no RH e ainda tem acesso'
    when c.tipo = 'pessoa' and coalesce(c.colaborador_id,'') = ''
      then 'pessoa sem ficha no RH'
    else null
  end as pendencia
from acesso_conta c
left join registros f
  on f.colecao = 'colaboradores' and f.id = c.colaborador_id and not f.apagado
where c.ativo;

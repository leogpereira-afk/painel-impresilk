-- O BRUTO NUNCA E MENOR QUE O VALOR FINAL.
--
-- Invariante da regra do desconto: `valor = bruto - desconto`, e desconto >= 0,
-- logo `bruto >= valor` sempre. Uma linha que viole isso e uma linha em que a
-- conta se perdeu no caminho.
--
-- POR QUE VIROU CONSTRAINT: a Edge Function estava gravando `bruto = 0` em O.S.
-- de R$ 310 -- eu editei o mapeamento com um replace de texto que nao casou
-- (tinha reindentado o bloco antes) e o script nao avisou. A carga rodou, o
-- servidor respondeu ok, 4.869 linhas foram gravadas com a conta zerada, e nada
-- em lugar nenhum reclamou. So apareceu porque fui conferir por outro motivo.
--
-- Comentario e teste ficam do lado de quem escreve e podem ser esquecidos na
-- proxima mudanca. A constraint mora no dado: quem gravar errado leva erro na
-- cara, e a carga registra a falha no diario em vez de encher a tabela de
-- numeros sem origem.
--
-- Primeiro o conserto das linhas que ja estao la: sem informacao de desconto,
-- o bruto E o valor (a carga do historico traz o desconto de verdade depois).

update public.painel_ordens set bruto = valor where bruto < valor;

alter table public.painel_ordens
  drop constraint if exists painel_ordens_bruto_coerente;

alter table public.painel_ordens
  add constraint painel_ordens_bruto_coerente
  check (bruto >= valor and desconto >= 0);

comment on constraint painel_ordens_bruto_coerente on public.painel_ordens is
  'valor = bruto - desconto, com desconto >= 0. Linha que viola e conta perdida no caminho.';

/* OS SEIS CONECTORES DO MARKETING, importados um a um.
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seções 4 e 5. Cada
 * conector exporta FONTE, SECRETS e coletar(ctx); quem roda é a Edge
 * Function painel-mkt-fontes.
 *
 * POR QUE IMPORT ESTÁTICO, e não um import com o caminho montado na hora: o
 * Supabase empacota a function seguindo os imports escritos no código. Um
 * caminho montado em tempo de execução não entra no pacote, e a fonte nova
 * responderia "módulo não encontrado" só em produção, no primeiro dia em que
 * o cron a chamasse. Fonte nova entra aqui E em FONTES (info.mjs); o teste
 * tests/mkt-fontes-edge.test.mjs confere que as duas listas batem.
 *
 * Estes arquivos moram numa subpasta de _shared: o scripts/publicar-functions.sh
 * manda a _shared inteira, subpastas inclusive (antes mandava só o primeiro
 * nível, e esta pasta ficaria de fora do servidor).
 */
import * as site from './site.mjs';
import * as google from './google.mjs';
import * as meta from './meta.mjs';
import * as google_ads from './google_ads.mjs';
import * as linkedin from './linkedin.mjs';
import * as pinterest from './pinterest.mjs';

export const CONECTORES = Object.freeze({ site, google, meta, google_ads, linkedin, pinterest });

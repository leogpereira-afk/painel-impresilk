/* COMO LIGAR CADA FONTE DO MARKETING: o passo a passo do dono, que aparece
 * recolhido em Configurações > Marketing > Conexões ("Como ligar").
 *
 * DE ONDE VEIO. Da pesquisa de cada fonte (integracoes-pesquisa.json, fora
 * do repositório, campo levantamento.passos_do_dono), com as correções da
 * contraprova; onde as duas discordam, vale a contraprova. O que mudou por
 * causa dela:
 *  - Google: o Conectar pede só Analytics, Search Console e Perfil da
 *    Empresa. O escopo do Google Ads ficou de fora (a página do Google Ads de
 *    30/09/2026 o chama de restrito; o Google Ads vai por conta de serviço);
 *  - Perfil da Empresa: antes da aprovação, só as quatro APIs; a Google My
 *    Business API só aparece depois do e-mail. Para saber se aprovou, a linha
 *    "por minuto" da aba Cotas (as "por dia" confundem);
 *  - a tela "O Google não verificou este app" pode mostrar o endereço técnico
 *    no lugar do nome do app; "Interno" só com o projeto numa organização;
 *  - Google Ads: o developer token acabou em 09/09/2026; o nível Explorer se
 *    pede no Google Cloud (Google Ads API Overview), e a avaliação gratuita
 *    do Google Cloud faz o Google recusar;
 *  - Meta: o app nasce pelo caminho "Outro" e o botão final é "Criar app"; a
 *    Página e o Instagram precisam de Acesso parcial com Conteúdo e Insights
 *    (só Insights não acha a Página);
 *  - LinkedIn: super admin em Settings, Manage admins; nome do app sem a
 *    sequência "in"; recurso "Vetting Appeal" quando a negativa é da
 *    verificação; o revisor do nível Standard pede um acesso de teste;
 *  - Pinterest: a fila do Trial access está atrasada desde agosto de 2026;
 *    depois de uma negativa os campos travam, e o caminho é o chamado pelo
 *    link direto;
 *  - Supabase: a tela é Edge Functions, Secrets (campos Key e Value, botão
 *    Save), e a coleta lê o secret novo na hora, sem publicar de novo.
 *
 * OS NOMES DOS SECRETS SÃO OS QUE O CÓDIGO EXPORTA (o SECRETS de cada
 * conector em supabase/functions/_shared/mkt-fontes/, mais o
 * SECRETS_OPCIONAIS dele), e não os da pesquisa: GOOGLE_PSI_KEY,
 * META_SYSTEM_USER_TOKEN, GOOGLE_CLIENT_ID e GBP_CLIENT_ID não existem no
 * código, e o Léo cadastraria um secret que ninguém lê. O teste
 * tests/mkt-conexoes-passos.test.mjs confere que todo nome citado aqui é do
 * conector daquela fonte, e que o passo de um opcional diz que é opcional
 * (GOOGLE_API_KEY do site, META_APP_SECRET da Meta, GOOGLE_ADS_CUSTOMER_ID e
 * GOOGLE_ADS_LOGIN_CUSTOMER_ID do Google Ads), com o motivo: sem isso o Léo
 * cadastraria por via das dúvidas o que a casa não precisa.
 *
 * Nada aqui é segredo: são nomes, endereços públicos e cliques. Sem
 * travessão (regra da casa; o mesmo teste confere).
 */
import { REDIRECT_URI } from '../../../supabase/functions/_shared/mkt-oauth.mjs';

/** O endereço de retorno que Google, LinkedIn e Pinterest pedem no app de
 *  cada um. Vem do mesmo lugar que o servidor usa (mkt-oauth.mjs). */
export const URL_RETORNO = REDIRECT_URI;

/** A tela de Secrets das Edge Functions (o "_" deixa escolher o projeto). */
export const URL_SECRETS = 'https://supabase.com/dashboard/project/_/functions/secrets';

/** O lembrete que abre todo "Como ligar". */
export const AVISO_DOS_VALORES =
  'Chaves, tokens e o arquivo .json vão só para os Secrets do Supabase. Nunca em conversa, print, planilha ou GitHub: os repositórios são públicos. Esta tela nunca pede nem mostra esses valores.';

const NO_SUPABASE = `Abra ${URL_SECRETS} (Edge Functions, Secrets) no projeto do Painel.`;

export const PASSOS = Object.freeze({
  site: Object.freeze({
    titulo: 'Site',
    resumo:
      'O HTML, o robots.txt, o sitemap, o WordPress e o DNS são lidos sem senha nenhuma. Uma chave gratuita do Google liga as notas do PageSpeed e a experiência real do Chrome (CrUX). Não tem botão Conectar.',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'O endereço do site',
        passos: Object.freeze([
          'O endereço vem do canal Site (Configurações, Marketing, Canais, Site, campo Link do perfil). Confira que está https://impresilk.com.br.',
        ]),
      }),
      Object.freeze({
        titulo: 'A chave do Google (PageSpeed e CrUX)',
        passos: Object.freeze([
          'Entre em https://console.cloud.google.com com a conta Google da Impresilk (de preferência a mesma do Google Analytics e do Google Ads).',
          'No alto, clique no seletor de projeto e em Novo projeto. Nome: Painel Impresilk. Clique em Criar e, quando ficar pronto, escolha o projeto no mesmo seletor. Se o projeto já existe (criado para o Google), use o mesmo.',
          'No menu (as três linhas no canto de cima, à esquerda), abra APIs e serviços, Biblioteca. Busque PageSpeed Insights API, abra e clique em Ativar. Volte e faça o mesmo com Chrome UX Report API.',
          'Em APIs e serviços, Credenciais, clique em Criar credenciais e escolha Chave de API.',
          'Em Restrições de API, marque só PageSpeed Insights API e Chrome UX Report API, e deixe desmarcado vincular conta de serviço. Clique em Criar e copie a chave.',
          'Se o Google oferecer faturamento ou pedir cartão, recuse: essas duas APIs são gratuitas. Não ligue outras APIs (como a do Gemini) nessa mesma chave.',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Em Key, escreva GOOGLE_API_KEY; em Value, cole a chave; clique em Save. Essa chave é opcional: sem ela, o resto do site é lido do mesmo jeito, e só o PageSpeed e a experiência real do Chrome ficam desligados.`,
          'Volte aqui e clique em Atualizar agora na linha do Site, ou espere a coleta de amanhã cedo.',
        ]),
      }),
    ]),
  }),

  google: Object.freeze({
    titulo: 'Google (Analytics, Search Console e Perfil da Empresa)',
    resumo:
      'Um botão Conectar liga os três de uma vez, com a conta Google que manda no Analytics do site. O Analytics e o Search Console funcionam logo; o Perfil da Empresa depende de uma aprovação do Google, que pode levar semanas.',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'Antes de começar',
        passos: Object.freeze([
          'Descubra qual conta Google é Administrador do Analytics do site: em https://analytics.google.com, clique em Administrador (a engrenagem, embaixo à esquerda) e, na coluna Propriedade, em Gerenciamento de acesso à propriedade. Use essa conta em todos os passos.',
          'Em https://search.google.com/search-console, com a mesma conta, veja se o site aparece na caixinha de propriedade, no alto à esquerda. A melhor é a do tipo Domínio (impresilk.com.br, sem https na frente), que junta http, https e www. Em Configurações, Usuários e permissões, a sua conta tem de aparecer como Proprietário.',
          'Se o site não aparecer: Adicionar propriedade, Domínio, impresilk.com.br, Continuar. Copie o texto que começa com google-site-verification=, crie um registro TXT com ele na zona de DNS do domínio, no painel da Locaweb, e volte para clicar em Verificar. Pode levar de algumas horas até 2 ou 3 dias. Nunca apague esse registro depois.',
          'Tenha uma página de política de privacidade publicada no site (se não existir, crie no WordPress antes).',
        ]),
      }),
      Object.freeze({
        titulo: 'No Google Cloud',
        passos: Object.freeze([
          'Abra https://console.cloud.google.com com a mesma conta. No seletor de projeto, clique em Novo projeto, dê o nome Painel Impresilk e clique em Criar. Confira que ele ficou escolhido no alto da tela.',
          'No menu, abra APIs e serviços, Biblioteca, e ative uma por uma: Google Analytics Data API, Google Analytics Admin API e Google Search Console API.',
          'Na mesma Biblioteca, para o Perfil da Empresa, ative: My Business Account Management API, My Business Business Information API, My Business Verifications API e Business Profile Performance API.',
          'No menu, abra Google Auth Platform e clique em Primeiros passos (ou Começar). Nome do app: Painel Impresilk. E-mail de suporte e de contato: o seu. Público: Externo (conta Gmail só tem Externo). Aceite a política e clique em Criar.',
          'Em Branding (Marca): Página inicial do app https://impresilk.com.br; Link da política de privacidade: o endereço da página de privacidade; em Domínios autorizados, adicione impresilk.com.br e também heveemylixartyijxewh.supabase.co. Salve. Não envie logotipo: logotipo obriga verificação.',
          'Em Acesso a dados (Data Access), clique em Adicionar ou remover escopos e marque estes três (se algum não aparecer na lista, cole o endereço no campo de adicionar manualmente): https://www.googleapis.com/auth/analytics.readonly, https://www.googleapis.com/auth/webmasters.readonly e https://www.googleapis.com/auth/business.manage. Clique em Atualizar e em Salvar. É normal o Google marcar algum como sensível.',
          'Em Público (Audience), clique em Publicar app e confirme: o status tem de ficar Em produção. Em Teste a conexão cai a cada 7 dias. Não precisa pedir verificação: o app é só da casa.',
          `Em Clientes (Clients), clique em Criar cliente, tipo Aplicativo da Web, nome Painel Supabase. Em URIs de redirecionamento autorizados, clique em Adicionar URI e cole exatamente ${URL_RETORNO} (sem barra no final). Origens JavaScript não precisa. Clique em Criar.`,
          'Abre uma janela com o ID do cliente e a Chave secreta do cliente. A chave secreta só aparece agora: copie as duas para um lugar seguro (ou clique em Baixar JSON).',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Crie GOOGLE_OAUTH_CLIENT_ID com o ID do cliente e GOOGLE_OAUTH_CLIENT_SECRET com a chave secreta (em Key o nome, em Value o valor, e Save).`,
        ]),
      }),
      Object.freeze({
        titulo: 'Aqui no Painel',
        passos: Object.freeze([
          'Espere de 5 minutos a algumas horas (o endereço de retorno novo demora a valer no Google). Depois clique em Conectar na linha do Google.',
          'Escolha a conta. Na tela "O Google não verificou este app", clique em Avançado e depois no link que começa com Acessar (ou Ir para) e termina com (não seguro). Ele pode mostrar o endereço técnico (heveemylixartyijxewh.supabase.co) no lugar do nome do app. É esperado: o app é só da casa.',
          'Na tela seguinte, marque todas as caixinhas (Analytics, Search Console e Perfil da Empresa) e clique em Continuar. Caixinha desmarcada é parte sem dados.',
          'Você volta para esta mesma aba e o Painel confirma a conexão sozinho (a confirmação só vale na aba em que você clicou em Conectar). A propriedade do Analytics é achada pelo código do site. Se aparecer que ela não foi achada, a conta conectada não tem acesso: peça a quem é Administrador para adicionar você (Administrador, Gerenciamento de acesso à propriedade, botão +, Adicionar usuários, papel Leitor).',
          'Se, com o app Em produção, o Google barrar a entrada com o erro 403 access_denied: volte o app para Teste (em Público), adicione o seu e-mail em Usuários de teste e conecte de novo. Assim a conexão cai a cada 7 dias, e é só clicar em Reconectar.',
          'Conta com o Programa de Proteção Avançada do Google não passa da tela de app não verificado: use outra conta com acesso ao Analytics, ao Search Console e ao Perfil.',
        ]),
      }),
      Object.freeze({
        titulo: 'Perfil da Empresa: a aprovação do Google',
        passos: Object.freeze([
          'Em https://business.google.com, com a conta PROPRIETÁRIA do perfil, confira: perfil verificado, ativo há mais de 60 dias e com o site https://impresilk.com.br.',
          'No Google Cloud, na página inicial do projeto Painel Impresilk, anote o Número do projeto (só números).',
          'Abra https://support.google.com/business/contact/api_default com a conta proprietária, escolha Application for Basic API Access e preencha o nome da empresa, o site igual ao do perfil, o e-mail proprietário e o número do projeto. Envie UMA vez só e não reenvie enquanto estiver pendente (o Google pediu isso em setembro de 2026).',
          'Para saber se aprovou: em APIs e serviços, abra a My Business Business Information API, aba Cotas, e olhe a linha de pedidos POR MINUTO (ignore as linhas por dia). Zero é esperando; 300 é aprovado. Pode levar semanas.',
          'Depois do e-mail de aprovação, ative também a Google My Business API (avaliações, posts, fotos e seguidores), que só aparece na Biblioteca depois disso. Não precisa conectar de novo: a próxima coleta já traz o Perfil.',
          'Até lá, a linha mostra o Perfil como Aguardando aprovação e o Analytics e o Search Console funcionam. Se a conta for do Google Workspace, o serviço Perfil da Empresa tem de estar ligado no admin do Workspace.',
        ]),
      }),
    ]),
  }),

  meta: Object.freeze({
    titulo: 'Meta (Facebook e Instagram)',
    resumo:
      'Não tem botão Conectar: um token do Gerenciador de Negócios lê a Página, o Instagram, os anúncios e o Pixel. Não precisa de aprovação da Meta. Uns 30 minutos.',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'No Gerenciador de Negócios',
        passos: Object.freeze([
          'Em https://business.facebook.com, abra Configurações (a engrenagem) e, em Contas, confira que estão lá a Página da Impresilk, a conta do Instagram e a conta de anúncios; em Fontes de dados, Conjuntos de dados (ou Pixels), o Pixel do site. Se faltar algum, clique em Adicionar naquela lista.',
          'O Instagram tem de ser conta profissional (Empresa ou Criador de conteúdo) e estar ligado à Página: no Instagram, Configurações, Tipo de conta e ferramentas; na Página, Configurações, Contas vinculadas, Instagram.',
        ]),
      }),
      Object.freeze({
        titulo: 'O app',
        passos: Object.freeze([
          'Abra https://developers.facebook.com/apps/creation. Preencha o nome (Painel Impresilk) e o e-mail de contato e clique em Avançar. Role a tela, escolha Outro e clique em Avançar; escolha Empresa e Avançar; na página de detalhes, ligue o portfólio da Impresilk e clique em Criar app.',
          'No painel do app, clique em Adicionar produto e em Configurar no cartão API de Marketing. Não precisa preencher nada.',
        ]),
      }),
      Object.freeze({
        titulo: 'O usuário do sistema e o token',
        passos: Object.freeze([
          'Em https://business.facebook.com, Configurações, Usuários, Usuários do sistema, clique em Adicionar. Nome: painel-coletor. Função: Funcionário (basta para ler). Clique em Criar usuário do sistema.',
          'Com o painel-coletor escolhido, clique em Atribuir ativos. Página: Acesso parcial, com Conteúdo e Insights ligados (não precisa de Controle total). Instagram: também Conteúdo e Insights. Conta de anúncios: ver desempenho. Pixel (conjunto de dados): ver. E o app Painel Impresilk. Salve.',
          'Ainda no painel-coletor, clique em Gerar token. Escolha o app Painel Impresilk, validade Nunca, e marque estas permissões: pages_show_list, pages_read_engagement, pages_read_user_content, read_insights, instagram_basic, instagram_manage_insights, ads_read e business_management. Clique em Gerar e confirme o código de dois fatores. O token aparece UMA vez: copie.',
          'Se o portfólio não deixar escolher Nunca, use 60 dias; aí, antes de vencer, gere outro token e troque o valor no Supabase.',
          'Opcional: em https://developers.facebook.com/tools/debug/accesstoken cole o token e clique em Depurar. Deve mostrar Expira: Nunca e as oito permissões. Feche a aba depois.',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Em Key, escreva META_TOKEN; em Value, cole o token; clique em Save.`,
          'Opcional, só se o app estiver com Exigir segredo do app ligado (em https://developers.facebook.com/apps, no app, Configurações do app, Avançado): crie também META_APP_SECRET com a Chave secreta do app (Configurações do app, Básico, botão Mostrar). Com essa opção desligada, que é o normal, não precisa: a Meta aceita o token sozinho.',
          'Volte aqui e clique em Atualizar agora na linha da Meta. A coleta acha sozinha a Página, o Instagram e a conta de anúncios.',
        ]),
      }),
    ]),
  }),

  google_ads: Object.freeze({
    titulo: 'Google Ads',
    resumo:
      'Não tem botão Conectar: uma conta de serviço com acesso Somente leitura ao Google Ads. O Google precisa liberar o nível Explorer da Google Ads API para o projeto (o developer token acabou em 09/09/2026; o pedido agora é no Google Cloud).',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'No Google Cloud',
        passos: Object.freeze([
          'Em https://console.cloud.google.com, com a conta que administra o Google Ads, use o projeto Painel Impresilk (ou crie um em Novo projeto). Não precisa ativar faturamento. Se aparecer Free trial (avaliação gratuita), o Google recusa o acesso: use um projeto fora da avaliação gratuita.',
          'Abra https://console.cloud.google.com/flows/enableapi?apiid=googleads.googleapis.com, confira no alto se o projeto certo está escolhido e clique em Ativar. O projeto começa no nível Test, que não lê conta de verdade.',
          'Abra https://console.cloud.google.com/google/ads-apis/overview. Em Upgrade access level, confira que o próximo nível é Explorer e clique em Apply for access. Precisa ser Proprietário ou Editor do projeto (quem criou já é). Se aparecer um formulário, diga que é uso interno, só leitura dos relatórios da própria conta. Na maioria dos casos a análise é automática: volte à página até aparecer Explorer.',
          'Se vier recusa dizendo que o projeto "does not meet the eligibility criteria", a causa é o faturamento do projeto (avaliação gratuita, suspenso ou desativado), e não a Impresilk.',
        ]),
      }),
      Object.freeze({
        titulo: 'A conta de serviço',
        passos: Object.freeze([
          'No Google Cloud, abra IAM e administrador, Contas de serviço (https://console.cloud.google.com/iam-admin/serviceaccounts). Clique em Criar conta de serviço, nome painel-google-ads, e em Concluir, sem dar nenhum papel.',
          'Abra a conta criada, aba Chaves, Adicionar chave, Criar nova chave, JSON, Criar. O arquivo .json que baixa é a única cópia e vale como senha. Anote o e-mail da conta de serviço (termina em .iam.gserviceaccount.com).',
          'Se o Google recusar criar a chave por política da organização, pare aqui e avise quem cuida do Painel: quem libera é o administrador da organização no Google Cloud.',
        ]),
      }),
      Object.freeze({
        titulo: 'No Google Ads',
        passos: Object.freeze([
          'Em https://ads.google.com, como administrador: Administrador, Acesso e segurança, aba Usuários, botão +. Cole o e-mail da conta de serviço, escolha Somente leitura e clique em Adicionar conta. (Conta de serviço não aceita o nível Somente e-mail.)',
          'Se a conta do Google Ads da Impresilk fica debaixo de uma conta de agência (MCC), anote o ID da conta da Impresilk e o da agência (os números de 10 dígitos no alto da tela de cada uma): o passo opcional no Supabase, mais abaixo, usa os dois.',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Em Key, escreva GOOGLE_ADS_SA_JSON; em Value, cole o conteúdo INTEIRO do arquivo .json; clique em Save.`,
          'Depois guarde o .json num cofre seguro, ou apague o arquivo e esvazie a lixeira.',
          'Opcional, só se a linha do Google Ads pedir (ela avisa quando a coleta não consegue escolher sozinha a conta de anúncios): crie também GOOGLE_ADS_CUSTOMER_ID com os 10 dígitos do ID da conta de anúncios da Impresilk, sem os traços. Se essa conta fica debaixo de uma agência (MCC), crie ainda GOOGLE_ADS_LOGIN_CUSTOMER_ID com o ID da conta da agência. Sem os dois, a coleta acha sozinha a conta que tem a tag do site.',
          'Volte aqui e clique em Atualizar agora na linha do Google Ads. Enquanto o nível Explorer não sair, a linha mostra Aguardando aprovação. O nível cai depois de 90 dias sem uso; a coleta diária evita isso.',
        ]),
      }),
    ]),
  }),

  linkedin: Object.freeze({
    titulo: 'LinkedIn',
    resumo:
      'Botão Conectar, depois que o LinkedIn aprovar o app na Community Management API (algumas semanas). A conexão vale 60 dias (365, se o LinkedIn liberar a renovação), e a linha avisa quando for hora de Reconectar.',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'Antes de começar',
        passos: Object.freeze([
          'Confira que você é super admin da Página da Impresilk: na visão de super admin da Página, clique em Settings (Configurações) no menu da esquerda e em Manage admins (Gerenciar administradores).',
          'Tenha à mão: um e-mail @impresilk.com.br (e-mail pessoal é reprovado), a razão social, o endereço do CNPJ, o site https://impresilk.com.br e uma página de política de privacidade publicada no site.',
        ]),
      }),
      Object.freeze({
        titulo: 'O app no LinkedIn',
        passos: Object.freeze([
          'Abra https://www.linkedin.com/developers/apps/new. App name: um nome sem LinkedIn, Microsoft, Linked ou In, e sem a sequência "in" dentro de outra palavra (exemplo: Impresilk Gestao). LinkedIn Page: a Página da Impresilk (o app fica preso a ela para sempre). Privacy policy URL: a página de privacidade. App logo: só o logo da Impresilk. Aceite os termos e clique em Create app.',
          "Na aba Settings, clique em Verify, depois em Generate URL e em Copy URL. Abra esse link logado como super admin da Página e aprove. Volte e clique em I'm done. O link vale 30 dias.",
          'Na aba Products, em Community Management API, clique em Request access. NÃO adicione nenhum outro produto antes nem junto, senão o pedido trava. No caso de uso, marque só Page Analytics e escreva: painel interno da própria Impresilk, só leitura de seguidores, visitas e desempenho dos posts da nossa Página, sem dados de pessoas. Confirme o e-mail corporativo (olhe também o spam) e responda o questionário do portal em até 21 dias.',
          'Acompanhe em My apps, no app, aba Products. Reapply quer dizer que faltou informação: complete e reenvie. Negado na verificação da empresa: abra o formulário de suporte com o tipo Vetting Appeal e o Client ID do app. Negado pelo caso de uso: é preciso criar um app novo e repetir.',
        ]),
      }),
      Object.freeze({
        titulo: 'Depois da aprovação',
        passos: Object.freeze([
          `Na aba Auth, em Authorized redirect URLs for your app, clique no lápis, adicione exatamente ${URL_RETORNO} e clique em Update. Em OAuth 2.0 scopes, confira que aparecem rw_organization_admin, r_organization_social e r_organization_social_feed.`,
          'Copie o Client ID e, clicando no olho, o Primary Client Secret.',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Crie LINKEDIN_CLIENT_ID com o Client ID e LINKEDIN_CLIENT_SECRET com o Primary Client Secret (em Key o nome, em Value o valor, e Save).`,
        ]),
      }),
      Object.freeze({
        titulo: 'Aqui no Painel',
        passos: Object.freeze([
          'Clique em Conectar na linha do LinkedIn, entre no LinkedIn se pedir e clique em Allow (Permitir). Você volta para esta mesma aba e o Painel confirma a conexão sozinho.',
          'Quando a linha pedir Reconectar (perto dos 60 dias), é só clicar: com você logado no LinkedIn, a volta é direta.',
          'Entre 1 e 3 meses depois de ligado, e antes de completar 12 meses, peça o nível Standard (senão o LinkedIn corta o acesso): aba Products, Community Management API, formulário Standard tier. Grave um vídeo de tela de menos de 5 minutos, narrado, mostrando o Conectar, a tela de permissão do LinkedIn e os números do canal. O LinkedIn pede também um acesso de teste para o revisor: uma conta do Painel só para isso, apagada depois da revisão.',
        ]),
      }),
    ]),
  }),

  pinterest: Object.freeze({
    titulo: 'Pinterest',
    resumo:
      'Botão Conectar, depois que o Pinterest aprovar o app (Trial access). O prazo oficial é de 1 a 3 dias úteis, mas a fila está atrasada desde agosto de 2026, com negativas genéricas: não conte com data.',
    etapas: Object.freeze([
      Object.freeze({
        titulo: 'Antes de começar',
        passos: Object.freeze([
          'O perfil da Impresilk no Pinterest tem de ser conta empresarial, com o e-mail confirmado.',
          'O site precisa de uma página pública de política de privacidade, que abra sem login (se não existir, crie no WordPress). Sem ela o pedido é negado.',
          'Recomendado: reivindique o site impresilk.com.br no Pinterest (https://help.pinterest.com/business/article/claim-your-website). Assim a coleta traz também os Pins que outras pessoas salvam do site.',
        ]),
      }),
      Object.freeze({
        titulo: 'O app no Pinterest',
        passos: Object.freeze([
          'Logado com a conta da Impresilk, abra https://developers.pinterest.com/apps/ e aceite os Termos do Desenvolvedor.',
          'Clique em Connect app. Nome: Painel Impresilk. Descrição longa e concreta, por exemplo: Painel interno de gestão da Impresilk. Só leitura das métricas da nossa própria conta (alcance, impressões, cliques, salvamentos, Pins, pastas e anúncios) para acompanhar o marketing semanalmente. Não publica nada e não acessa contas de terceiros. Informe o site e o link da política de privacidade e envie o pedido de Trial access.',
          'Se não vier resposta em 3 dias úteis, ou se vier negativa (depois dela os campos do app travam e não dá para reenviar pela tela), abra chamado em https://help.pinterest.com/contact?pinterest_api_and_developer_tools=api_access&origin=pbc, com o App ID e o e-mail só dentro do chamado.',
        ]),
      }),
      Object.freeze({
        titulo: 'Depois da aprovação',
        passos: Object.freeze([
          `Em My apps, clique em Manage no app e abra a aba Configure. Em Redirect URIs, cole exatamente ${URL_RETORNO} e clique em Add. (Enquanto o pedido está pendente, esse campo fica travado.)`,
          'Na mesma aba, em API keys, copie o App id e a App secret key (o olho mostra; o ícone ao lado copia).',
        ]),
      }),
      Object.freeze({
        titulo: 'No Supabase',
        passos: Object.freeze([
          `${NO_SUPABASE} Crie PINTEREST_CLIENT_ID com o App id e PINTEREST_CLIENT_SECRET com a App secret key (em Key o nome, em Value o valor, e Save).`,
        ]),
      }),
      Object.freeze({
        titulo: 'Aqui no Painel',
        passos: Object.freeze([
          'Clique em Conectar na linha do Pinterest, entre com a conta da Impresilk se pedir e dê acesso ao app. Você volta para esta mesma aba e o Painel confirma a conexão sozinho.',
          'Se a Impresilk anuncia no Pinterest, confira em https://ads.pinterest.com se existe uma conta de anúncios ligada ao perfil. Sem ela, anúncios e público ficam vazios.',
          'Não troque a senha nem o nome de usuário do Pinterest sem avisar: isso derruba o acesso, e aí é preciso Reconectar.',
        ]),
      }),
    ]),
  }),
});

/* ------------------------------------------------- os pedaços de um passo -- */

// Nome de secret: palavra em MAIÚSCULAS com pelo menos um "_" no meio
// (GOOGLE_API_KEY, META_TOKEN). Nome de tela ("API", "JSON") não tem "_".
const NOME_DE_SECRET = '\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\\b';
// Endereço https: vai até o espaço, e o último caractere não é pontuação da
// frase ("...impresilk.com.br." termina no "br").
const ENDERECO = "https://[^\\s,;()\"]*[^\\s,;().:\"]";

/** Os nomes de secret citados num texto, na ordem e sem repetir. */
export function secretsNoTexto(texto) {
  return [...new Set([...String(texto ?? '').matchAll(new RegExp(NOME_DE_SECRET, 'g'))].map((m) => m[0]))];
}

/** Todo texto do passo a passo de uma fonte (título, resumo, etapas). */
export function textosDaFonte(fonte) {
  const g = PASSOS[fonte];
  if (!g) return [];
  return [g.titulo, g.resumo, ...g.etapas.flatMap((e) => [e.titulo, ...e.passos])];
}

/** Os nomes de secret que o passo a passo de uma fonte cita. */
export const secretsCitados = (fonte) => [...new Set(textosDaFonte(fonte).flatMap(secretsNoTexto))];

/** Um passo em pedaços, para a tela desenhar: [{tipo, valor}], com tipo
 *  - 'texto': o resto;
 *  - 'secret': nome de secret (vai em fonte de código);
 *  - 'retorno': o endereço de retorno (código, com o botão Copiar);
 *  - 'codigo': endereço que é identificador, e não página (os escopos do
 *    Google, https://www.googleapis.com/auth/...): abrir não leva a nada;
 *  - 'link': endereço para abrir (em outra aba). */
export function pedacosDoPasso(texto) {
  const s = String(texto ?? '');
  const fora = [];
  let ultimo = 0;
  for (const m of s.matchAll(new RegExp(`(${ENDERECO})|(${NOME_DE_SECRET})`, 'g'))) {
    if (m.index > ultimo) fora.push({ tipo: 'texto', valor: s.slice(ultimo, m.index) });
    const [valor, endereco] = m;
    if (!endereco) fora.push({ tipo: 'secret', valor });
    else if (valor === URL_RETORNO) fora.push({ tipo: 'retorno', valor });
    else if (valor.startsWith('https://www.googleapis.com/auth/')) fora.push({ tipo: 'codigo', valor });
    else fora.push({ tipo: 'link', valor });
    ultimo = m.index + valor.length;
  }
  if (ultimo < s.length) fora.push({ tipo: 'texto', valor: s.slice(ultimo) });
  return fora;
}

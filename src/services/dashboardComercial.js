import {chamarComercial,alteracoesComerciais} from './comercial.js';
import {criarCacheComercial} from '../lib/cache-comercial.mjs';
import {aoMudarSessao} from '../lib/sessao.js';
// Cache efêmero: nunca persiste carteira no navegador. Trocar identidade ou
// permissões descarta o escopo anterior. Respostas canceladas não entram.
const cache=criarCacheComercial();
export const invalidarDashboard=()=>cache.limpar();
alteracoesComerciais.addEventListener('alteracao',invalidarDashboard);
aoMudarSessao(invalidarDashboard);
export const consultarDashboard=(sessaoChave,filtro,{signal}={})=>cache.consultar(sessaoChave,JSON.stringify(filtro),()=>chamarComercial('dashboard',{filtro},signal),signal);
export const consultarDashboardDetalhe=(filtro,detalhe,signal)=>chamarComercial('dashboardDetalhe',{filtro,...detalhe},signal);

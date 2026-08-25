/* NOME -> COMPONENTE dos ícones de sistema, num módulo só.
 *
 * A ESCOLHA do ícone mora no registro (lib/sistemas.js, campo `icone`, como
 * string — string porque o conferir-sistemas lê aquele arquivo como texto puro
 * em node, sem conseguir importar lucide). Este módulo só RESOLVE o nome.
 *
 * Antes eram duas tabelas de escolha (lateral e Home) e elas divergiam: Brief
 * era régua num lugar e prancheta no outro, lado a lado na mesma tela de
 * desktop. Importar `* as icons` do lucide resolveria sem mapa — e custaria o
 * tree-shaking inteiro (centenas de kB); o mapa explícito importa só os oito.
 */
import {
  LayoutDashboard, Users, ClipboardList, Ruler, BarChart3, ShoppingCart,
  BookOpen, UserCircle, Trees, Building2, ArrowUpRight,
} from "lucide-react";

const ICONES = {
  LayoutDashboard, Users, ClipboardList, Ruler, BarChart3, ShoppingCart,
  BookOpen, UserCircle, Trees, Building2,
};

/** O componente do ícone declarado no registro; seta genérica quando faltar. */
export const iconeDoSistema = (s) => ICONES[s?.icone] || ArrowUpRight;

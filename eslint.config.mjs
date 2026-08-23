// ============================================================================
// A trava que faltava: as REGRAS DOS HOOKS do React.
//
// POR QUE ISTO EXISTE: em 04/08/2026 um `useMemo` foi parar ABAIXO dos returns
// de erro/carregando em Contas Atrasadas. Hook depois de return só roda em
// alguns renders, e o React conta hooks por posição — a tela inteira caía em
// branco ("Rendered more hooks than during the previous render") ao dar F5 ou
// ao clicar em Sincronizar. O build passou verde, o deploy foi conferido por
// hash do bundle, e mesmo assim o defeito subiu: `vite build` não olha para
// isso, e conferir o hash prova que o arquivo chegou, não que ele funciona.
//
// O escopo é de propósito estreito. Não é um lint de estilo: são as duas regras
// que apontam erro de RUNTIME, para o job nunca virar ruído que se aprende a
// ignorar. `exhaustive-deps` fica em warning porque quase sempre é opinião —
// mas aparece, para não sumir de vista.
// ============================================================================
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks, react },
    settings: { react: { version: "detect" } },
    rules: {
      // Hook condicional / depois de return: derruba a tela. Erro.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      /* IDENTIFICADOR QUE NAO EXISTE tambem e erro de RUNTIME, nao de estilo:
         em 23/08 um <Check/> foi usado sem importar, o eslint daqui passou, o
         build passou (esbuild nao confere identificador de JSX) e o
         ReferenceError so estouraria na tela, ao abrir a secao. E exatamente a
         classe do "apagar .js de app vanilla": verde em tudo, quebrado no uso.
         O no-undef do CORE nao enxerga JSX (o eslint-scope ignora
         JSXIdentifier) -- foi provado aqui: com o import removido ele passou
         calado. Quem pega componente e a regra do plugin react. */
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      /* Componente definido DENTRO de componente remonta a cada render: campo
         perde o foco, menu volta ao topo sob o cursor -- ja aconteceu duas
         vezes na casa, e Manutencoes/Campanhas (1.700/2.500 linhas, varios
         componentes internos) sao o terreno onde nasce. */
      "react/no-unstable-nested-components": "error",
    },
  },
];

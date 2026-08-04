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

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Hook condicional / depois de return: derruba a tela. Erro.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

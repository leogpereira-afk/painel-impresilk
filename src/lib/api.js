// Endereco do backend. Antes: Netlify Functions no MESMO dominio
// (/.netlify/functions/*). Agora: Edge Functions do Supabase -- dominio
// proprio, entao as URLs sao absolutas.
//
// Os nomes levam prefixo "painel-" porque o projeto do Supabase e compartilhado
// com RH, Brief, PCP e Central do Leo. Uma function chamada "auth" ou "sync"
// seria generica demais num projeto com cinco sistemas.
export const API = "https://heveemylixartyijxewh.supabase.co/functions/v1";

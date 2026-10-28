// Referência estática faz o Vite emitir os avisos junto com o piloto.
export const PRINT_LICENSES_URL = new URL('./vendor/THIRD_PARTY_NOTICES.txt', import.meta.url).href;

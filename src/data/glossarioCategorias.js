// As categorias do glossário, num módulo PRÓPRIO e pequeno.
// Elas moravam em data/glossario.js junto da SEMENTE de 96 kB -- e importar
// uma constante de oito strings custava baixar o arquivo inteiro em toda
// abertura da aba. A semente só é necessária UMA vez na vida do sistema
// (quando o servidor está vazio) e agora desce por import() dinâmico.
export const CATEGORIAS = ["Material", "Impressão", "Acabamento", "Peça", "Produção", "Instalação", "Arte e processo", "Comercial"];

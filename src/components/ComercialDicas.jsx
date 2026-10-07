import {useId, useMemo, useState} from 'react';
import {ArrowRight, CheckCircle2, ClipboardList, FileText, Flag, Lightbulb, MessageCircle, Search, Shapes, Store, Wrench, X} from 'lucide-react';
import './comercial-dicas.css';

const GUIAS = [
  {
    id: 'fachadas', nome: 'Fachadas e placas', icone: Store,
    resumo: 'Comece pelo que a marca precisa comunicar e por onde ela será vista.',
    aplicacao: 'Identificação de lojas, placas de orientação e comunicação de ambientes.',
    perguntas: ['O que precisa ser lido e a que distância?', 'Quais são as medidas? Há foto da fachada e do ponto de fixação?', 'O local é interno ou externo? Precisa de iluminação?', 'Há estrutura, acesso para instalar e autorização do local?'],
    cuidado: 'Confirme material, estrutura, fixação e condições de acesso com a equipe técnica. Iluminação e ponto elétrico precisam entrar no escopo.',
    frase: 'Me manda uma foto do local e conta o que você quer destacar. Com isso, vamos conferir a solução e as medidas para o seu orçamento.',
    termos: 'fachada placa acm letreiro letra caixa luminoso sinalização sinalizacao'
  },
  {
    id: 'adesivos', nome: 'Adesivos', icone: Shapes,
    resumo: 'A superfície e o uso ajudam a escolher a solução certa.',
    aplicacao: 'Vitrines, paredes, identificação e comunicação em veículos, conforme o material indicado.',
    perguntas: ['Onde será aplicado? Qual é o material e o estado da superfície?', 'Quais são as medidas, a quantidade e o tempo de uso desejado?', 'Vai receber sol, chuva, limpeza frequente ou atrito?', 'A arte está pronta? Precisa de retirada do adesivo anterior ou instalação?'],
    cuidado: 'Compatibilidade, preparação da superfície, remoção e durabilidade dependem do material e da avaliação do local. Confira antes de prometer um resultado.',
    frase: 'Para te indicar o adesivo, preciso ver onde será aplicado. Pode me enviar uma foto, as medidas e dizer por quanto tempo pretende usar?',
    termos: 'adesivo vinil vitrine parede carro veiculo veículo envelopamento recorte'
  },
  {
    id: 'lonas', nome: 'Lonas e banners', icone: Flag,
    resumo: 'Defina a mensagem, o espaço e como a peça ficará presa.',
    aplicacao: 'Divulgação de campanhas, eventos e comunicação temporária.',
    perguntas: ['Qual é a medida final e quantas peças serão necessárias?', 'Onde ficará exposto? É interno ou externo?', 'Como será instalado? Precisa de acabamento ou estrutura?', 'Qual é a data do evento e quem aprova a arte?'],
    cuidado: 'Acabamentos, resistência, fixação e uso externo devem ser confirmados com produção e instalação. Separe a data do evento do prazo de entrega combinado.',
    frase: 'Vamos confirmar o tamanho, o local de exposição e a forma de instalar. Assim o orçamento já considera os acabamentos que você vai precisar.',
    termos: 'lona banner faixa evento ilhos ilhós acabamento bastao bastão'
  },
  {
    id: 'impressos', nome: 'Impressos', icone: FileText,
    resumo: 'Entenda o objetivo da peça antes de falar em formato e tiragem.',
    aplicacao: 'Materiais de apresentação, divulgação e apoio ao atendimento.',
    perguntas: ['Qual é a finalidade, o formato e a quantidade?', 'Será impresso em uma ou duas faces? Quais acabamentos deseja?', 'A arte está pronta ou será preciso criar e revisar?', 'Quem aprova a prova e quando o material precisa estar disponível?'],
    cuidado: 'Papel, cores, acabamento, arquivo e prazo dependem da disponibilidade e da validação da produção. Combine a aprovação da arte antes de liberar o pedido.',
    frase: 'Conta como esse material será usado e a quantidade que precisa. Vamos conferir formato, acabamento e a arte antes de fechar a proposta.',
    termos: 'impresso cartão cartao papel panfleto folder flyer livreto tiragem prova'
  },
  {
    id: 'instalacao', nome: 'Instalação', icone: Wrench,
    resumo: 'Uma visita bem preparada evita deslocamento e retorno desnecessários.',
    aplicacao: 'Planejamento da instalação dos serviços aprovados, com condições do local conferidas.',
    perguntas: ['Qual é o endereço e quem acompanha a equipe no local?', 'Há fotos, medidas conferidas e acesso liberado?', 'Existem altura, obstáculos, energia ou equipamentos especiais envolvidos?', 'O que está incluído? Há retirada de material antigo ou transporte?', 'Qual é a janela de atendimento e quem confirma a conclusão?'],
    cuidado: 'A equipe técnica define método, recursos e condições de segurança. Registre pendências e confirme o que precisa estar pronto antes de agendar.',
    frase: 'Antes de combinar a instalação, vamos conferir o acesso e o que precisa estar pronto no local. Quem será nosso contato para receber a equipe?',
    termos: 'instalação instalacao montagem visita acesso altura transporte medida retirada'
  }
];

const normalizar = texto => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();

export default function ComercialDicas({compacto = false, onAbrir}) {
  const buscaId = useId();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const guias = useMemo(() => {
    const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
    return GUIAS.filter(guia => {
      const texto = normalizar([guia.nome, guia.resumo, guia.aplicacao, ...guia.perguntas, guia.cuidado, guia.termos].join(' '));
      return (categoria === 'todas' || guia.id === categoria) && palavras.every(palavra => texto.includes(palavra));
    });
  }, [busca, categoria]);

  if (compacto) return <aside className="com-dicas-convite" aria-label="Dicas de produtos">
    <span className="com-dicas-lampada" aria-hidden="true"><Lightbulb size={22}/></span>
    <div><strong>Uma boa pergunta faz diferença.</strong><p>Aplicações e perguntas para ajudar na conversa com o cliente.</p></div>
    {onAbrir && <button type="button" onClick={onAbrir}>Dicas de produtos <ArrowRight size={16} aria-hidden="true"/></button>}
  </aside>;

  return <section className="com-dicas" aria-label="Guia de atendimento por produto">
    <div className="com-dicas-intro"><span className="com-dicas-lampada" aria-hidden="true"><Lightbulb size={22}/></span><div><strong>Mais segurança na próxima conversa.</strong><p>Escolha uma solução e veja o que perguntar antes de orçar.</p></div></div>
    <label className="com-dicas-busca" htmlFor={buscaId}><span className="com-dicas-label">Buscar dica</span><span><Search size={17} aria-hidden="true"/><input id={buscaId} type="search" placeholder="Ex.: fachada, medida, arte…" value={busca} onChange={e => setBusca(e.target.value)}/>{busca && <button type="button" aria-label="Limpar busca de dicas" onClick={() => setBusca('')}><X size={16} aria-hidden="true"/></button>}</span></label>
    <div className="com-dicas-categorias" role="group" aria-label="Filtrar dicas por solução">
      {[{id: 'todas', nome: 'Todas', icone: ClipboardList}, ...GUIAS].map(({id, nome, icone: Icone}) => <button key={id} type="button" aria-pressed={categoria === id} onClick={() => setCategoria(id)}><Icone size={15} aria-hidden="true"/>{nome}</button>)}
    </div>
    <p className="com-dicas-contagem" aria-live="polite">{guias.length === 1 ? '1 guia para consultar' : `${guias.length} guias para consultar`}</p>
    <div className="com-dicas-lista">{guias.map(({id, nome, icone: Icone, resumo, aplicacao, perguntas, cuidado, frase}) => <article className="com-dicas-guia" key={id} aria-labelledby={`${buscaId}-${id}`}>
      <header><span className="com-dicas-icone" aria-hidden="true"><Icone size={21}/></span><div><h3 id={`${buscaId}-${id}`}>{nome}</h3><p>{resumo}</p></div></header>
      <p className="com-dicas-aplicacao"><b>Onde usar</b>{aplicacao}</p>
      <h4><MessageCircle size={15} aria-hidden="true"/>Pergunte ao cliente</h4>
      <ul>{perguntas.map(pergunta => <li key={pergunta}><CheckCircle2 size={14} aria-hidden="true"/><span>{pergunta}</span></li>)}</ul>
      <div className="com-dicas-cuidado"><b>Antes de confirmar</b><p>{cuidado}</p></div>
      <details><summary>Uma forma de começar a conversa</summary><blockquote>{frase}</blockquote></details>
    </article>)}</div>
    {!guias.length && <div className="com-dicas-vazio"><Search size={22} aria-hidden="true"/><strong>Nenhuma dica com esse filtro.</strong><p>Tente o nome da solução ou uma palavra como “arte” ou “medidas”.</p><button type="button" onClick={() => {setBusca(''); setCategoria('todas');}}>Mostrar todas as dicas</button></div>}
    <p className="com-dicas-rodape">Guia de apoio ao atendimento. Especificações, disponibilidade, preço e prazo devem ser conferidos no cadastro do produto, na ficha do material e com a equipe responsável.</p>
  </section>;
}

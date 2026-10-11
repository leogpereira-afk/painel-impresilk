/* A GUARDA DAS ROTAS: o que segura o erro de uma tela antes que ele apague o
 * painel inteiro.
 *
 * Fica em volta do Suspense das rotas (App.jsx), DENTRO do Layout: o menu e
 * o cabeçalho continuam de pé, e só a área da tela mostra o problema.
 *
 * Arquivo da tela que não veio (versão nova publicada com a aba aberta, ver
 * lib/recarga-de-versao.js): recarrega a página uma vez, sozinha. Se já
 * recarregou há pouco, ou se o navegador não deixa guardar a marca, mostra a
 * mensagem com o botão Recarregar. Erro de programa dentro da tela não
 * recarrega (não adiantaria): mostra a mensagem e o botão do mesmo jeito.
 *
 * `chave` (a location.key do roteador, nova a cada navegação): navegar
 * limpa o erro e tenta a tela de novo. Sem ela, a mensagem ficaria presa na
 * área em todas as telas. Era o caminho (location.pathname), e o erro só
 * saía trocando de tela: com o Marketing quebrado em ?v=google, o "Marketing"
 * do menu levava a /marketing e o cartão de erro ficava; e o Recarregar
 * repete o endereço que quebrou. Com a key, qualquer navegação vale, até o
 * clique na tela em que a pessoa já está. Não é `key` do React de
 * propósito: uma key nova remontaria a tela a cada troca de endereço, mesmo
 * sem erro nenhum; aqui a chave só conta quando há erro na tela.
 */
import { Component } from 'react';
import { RefreshCw } from 'lucide-react';
import { ehFalhaDeCarga, podeRecarregarSozinho } from '../lib/recarga-de-versao.js';

function sessao() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default class GuardaDeRota extends Component {
  constructor(props) {
    super(props);
    // semRecarga: a falha é de carga, mas a recarga sozinha já foi gasta (ou
    // não há como marcar). Aí a mensagem aparece.
    this.state = { erro: null, semRecarga: false, chave: props.chave };
  }

  /* A troca de chave limpa o erro ANTES de desenhar, e não depois
     (componentDidUpdate). Depois era tarde: voltando a uma tela cujo arquivo
     já tinha falhado, o React.lazy lança o erro guardado no mesmo desenho em
     que a chave muda, e no fim desse desenho o componentDidUpdate (que roda
     antes do componentDidCatch) apagava o erro recém-chegado. A tela era
     desenhada de novo, falhava de novo, e a segunda captura achava a marca da
     recarga que a primeira acabara de gravar: aparecia "Esta tela não
     carregou" durante a recarga, em vez de "Atualizando o painel". Aqui, o
     erro que nasce sob a chave nova encontra a chave já guardada e fica. */
  static getDerivedStateFromProps(props, state) {
    if (props.chave === state.chave) return null;
    if (state.erro) return { erro: null, semRecarga: false, chave: props.chave };
    return { chave: props.chave };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro) {
    if (!ehFalhaDeCarga(erro)) return;
    if (podeRecarregarSozinho(sessao())) window.location.reload();
    else this.setState({ semRecarga: true });
  }

  render() {
    const { erro, semRecarga } = this.state;
    if (!erro) return this.props.children;
    const deCarga = ehFalhaDeCarga(erro);
    // Enquanto a recarga sozinha acontece: uma linha discreta, e não a
    // mensagem de erro piscando antes de a página voltar.
    if (deCarga && !semRecarga) {
      return (
        <p className="p-6 text-sm text-slate-400" role="status">
          Atualizando o painel para a versão nova…
        </p>
      );
    }
    return (
      // .card direto, e não o <Card> de ui.jsx: ele traz p-5 sm:p-6, e o
      // sm:p-6 (numa media query, escrita depois) vencia o p-8 daqui do sm
      // para cima. A mesma armadilha que o marketing/Bloco.jsx conta.
      <div className="card mx-auto max-w-md p-8 text-center" role="alert">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          {deCarga ? 'Esta tela não carregou' : 'Esta tela encontrou um erro'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {deCarga
            ? 'O painel pode ter sido atualizado agora, ou a internet caiu no meio. Recarregue a página para buscar a versão nova.'
            : 'Recarregue a página. Se o erro voltar, avise a direção dizendo em que tela foi.'}
        </p>
        <button type="button" className="btn-primary mx-auto mt-4 min-h-11" onClick={() => window.location.reload()}>
          <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
          Recarregar
        </button>
      </div>
    );
  }
}

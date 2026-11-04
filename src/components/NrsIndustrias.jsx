import {ArrowUpRight,ChevronDown,HardHat} from 'lucide-react';
import './nrs-industrias.css';

const FONTE='https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs/normas-regulamentadoras-nrs';
const GRUPOS=[
  {titulo:'Instalação e manutenção',itens:[
    ['NR-35','Trabalho em altura','Para atividades com desnível acima de 2 m e risco de queda, como instalação de fachadas e letreiros.'],
    ['NR-10','Eletricidade','Medidas de segurança em instalações e serviços elétricos, inclusive trabalhos em sua proximidade.'],
    ['NR-06','Equipamentos de proteção individual','Seleção, fornecimento, uso e orientação sobre os EPIs adequados aos riscos do serviço.'],
    ['NR-18','Construção','Segurança em obras, reformas e manutenção de edificações abrangidas pela norma.'],
  ]},
  {titulo:'Conforme o serviço e o local',itens:[
    ['NR-11','Movimentação de materiais','Segurança no transporte, movimentação e armazenagem, incluindo operação de equipamentos como empilhadeiras.'],
    ['NR-12','Máquinas e equipamentos','Proteções e procedimentos para trabalhar com máquinas e equipamentos com segurança.'],
    ['NR-20','Inflamáveis e combustíveis','Cuidados em instalações e atividades com inflamáveis ou combustíveis; a capacitação depende da função e da exposição.'],
    ['NR-33','Espaços confinados','Requisitos para entrada e trabalho em espaços confinados, com avaliação, autorização e equipe capacitada.'],
    ['NR-22','Mineração','Regras de segurança para serviços em operações de mineração, conforme a atividade executada.'],
  ]},
];

export default function NrsIndustrias() {
  return <details className="lnr-guide">
    <summary><span className="lnr-icon"><HardHat size={20}/></span><span className="lnr-title"><strong>NRs para serviços em indústrias</strong><small>9 normas para revisar · explicação e aplicação</small></span><span className="lnr-toggle"><span className="lnr-expand">Consultar</span><span className="lnr-collapse">Recolher</span><ChevronDown size={17}/></span></summary>
    <div className="lnr-content">
      <p className="lnr-intro">A exigência depende da atividade, dos riscos e das regras da contratante. Esta seleção orienta a revisão; as capacitações da nossa equipe ainda não foram informadas.</p>
      <div className="lnr-groups">{GRUPOS.map(grupo=><section key={grupo.titulo} className="lnr-group"><h3>{grupo.titulo}</h3><ul>{grupo.itens.map(([nr,titulo,descricao])=><li key={nr}><span className="lnr-code">{nr}</span><div><h4>{titulo}</h4><p>{descricao}</p></div></li>)}</ul></section>)}</div>
      <footer><span>NR é uma norma. A comprovação pode envolver treinamentos, documentos e autorizações, conforme o serviço.</span><a href={FONTE} target="_blank" rel="noopener noreferrer">Consultar normas no MTE<ArrowUpRight size={14}/></a></footer>
    </div>
  </details>;
}

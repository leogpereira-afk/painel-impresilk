import {BackupDados} from './Acessos.jsx';
import {CentralNavegacao} from '../components/CentralResumo.jsx';
import {PageTitle} from '../components/ui.jsx';
export default function Backups(){return <div className="space-y-6"><PageTitle titulo="Backups e recuperação" descricao="Acompanhe as cópias dos sistemas e encontre o que precisa restaurar."/><CentralNavegacao ativa="backup"/>{import.meta.env.MODE==='review' && <div className="review-fixture-notice">Os horários, quantidades e a falha abaixo são exemplos para avaliar a tela.</div>}<BackupDados/></div>;}

import React from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter,Routes,Route,Navigate,useLocation,useNavigate} from 'react-router-dom';
import Acessos from '../pages/Acessos.jsx';
import Backups from '../pages/Backups.jsx';
import Login from '../pages/Login.jsx';
import CentralShell from '../components/CentralShell.jsx';
import '../index.css';
import './preview.css';
function Preview(){
 const location=useLocation(),navigate=useNavigate();
 if(location.pathname==='/entrada')return <Login aoEntrar={()=>navigate('/acessos')}/>;
 return <CentralShell><Routes><Route path="/acessos" element={<Acessos/>}/><Route path="/minha-conta" element={<Acessos minhaConta/>}/><Route path="/backups" element={<Backups/>}/><Route path="*" element={<Navigate to="/acessos" replace/>}/></Routes></CentralShell>;
}
if(import.meta.env.MODE==='review')createRoot(document.getElementById('root')).render(<HashRouter><Preview/></HashRouter>);
else document.getElementById('root').textContent='Prévia disponível apenas no modo local de revisão.';

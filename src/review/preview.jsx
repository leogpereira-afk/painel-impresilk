import React from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter,useLocation,useNavigate} from 'react-router-dom';
import App from '../App.jsx';
import {AppProvider} from '../config/store.jsx';
import Login from '../pages/Login.jsx';
import '../index.css';
import './preview.css';
function Preview(){
 const location=useLocation(),navigate=useNavigate();
 if(location.pathname==='/entrada')return <Login aoEntrar={()=>navigate('/acessos')}/>;
 return <><aside className="review-preview-banner" role="note"><strong>SIMULAÇÃO — dados fictícios / sem envio.</strong> Alterações em Estrutura ficam apenas nesta aba e são descartadas ao recarregar.</aside><AppProvider><App/></AppProvider></>;
}
if(import.meta.env.MODE==='review')createRoot(document.getElementById('root')).render(<HashRouter><Preview/></HashRouter>);
else document.getElementById('root').textContent='Prévia disponível apenas no modo local de revisão.';

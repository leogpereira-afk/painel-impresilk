import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import ContasAtrasadas from "./pages/ContasAtrasadas.jsx";
import FluxoCaixa from "./pages/FluxoCaixa.jsx";
import Produtos from "./pages/Produtos.jsx";
import Orcamentos from "./pages/Orcamentos.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/contas-atrasadas" element={<ContasAtrasadas />} />
        <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/orcamentos" element={<Orcamentos />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Routes>
    </Layout>
  );
}

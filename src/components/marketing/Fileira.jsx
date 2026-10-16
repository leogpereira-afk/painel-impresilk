// Canais sempre visíveis: duas fileiras no desktop e grade adaptável no celular.
export default function Fileira({ rotulo, quantos, children }) {
  return (
    <nav className="mkt-fileira sem-impressao" aria-label={rotulo}>
      <div className="mkt-fileira-conteudo" style={{ '--mkt-colunas': Math.ceil((quantos + 1) / 2) }}>
        {children}
      </div>
    </nav>
  );
}

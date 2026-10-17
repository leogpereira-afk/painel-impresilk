const ENTRADAS = {
  brief: { titulo: 'Brief', url: 'https://leogpereira-afk.github.io/brief-medicao/#/lista' },
  layout: { titulo: 'Layout', url: 'https://leogpereira-afk.github.io/brief-medicao/layout.html' },
};

// Os dois sistemas mantêm sua sessão e suas permissões próprias.
export default function FerramentaBrief({tipo,integrada=false}) {
  const entrada = ENTRADAS[tipo];
  return <section aria-label={entrada.titulo} className={integrada?'central-comercial__brief':undefined} style={integrada?undefined:{height:'calc(100dvh - 110px)',minHeight:480}}>
    <iframe key={tipo} title={entrada.titulo} src={entrada.url}
      style={{width:'100%',height:'100%',border:0,borderRadius:12,background:'#fff'}} />
  </section>;
}

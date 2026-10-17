export function dominioGrafico(valores) {
  const validos=valores.filter(Number.isFinite);
  if(!validos.length)return {min:0,max:1,vazio:true};
  const min=Math.min(0,...validos),max=Math.max(0,...validos);
  return {min,max:max===min?min+1:max,vazio:false};
}

export function segmentosValidos(valores) {
  const segmentos=[];
  let atual=[];
  valores.forEach((valor,i)=>{
    if(Number.isFinite(valor))atual.push([i,valor]);
    else if(atual.length){segmentos.push(atual);atual=[];}
  });
  if(atual.length)segmentos.push(atual);
  return segmentos;
}

export function corSerie(id) {
  let hash=0;
  for(const letra of String(id))hash=(hash*31+letra.charCodeAt(0))>>>0;
  return `var(--chart-${hash%6+1})`;
}

export function recortePonto(ponto,periodo) {
  const de=ponto?.de>periodo?.de?ponto.de:periodo?.de;
  const fim=periodo?.ateEfetivo||periodo?.ate;
  const ate=ponto?.ate<fim?ponto.ate:fim;
  return de&&ate&&de<=ate?{modo:'personalizado',de,ate}:null;
}

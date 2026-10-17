export function recorteMesDashboard(mes,periodo) {
  if(!/^\d{4}-\d{2}$/.test(mes)||!periodo?.de||!(periodo.ateEfetivo||periodo.ate))return null;
  const ultimo=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5)),0)).getUTCDate();
  const inicioMes=`${mes}-01`,fimMes=`${mes}-${ultimo}`,fimPeriodo=periodo.ateEfetivo||periodo.ate;
  const de=periodo.de>inicioMes?periodo.de:inicioMes,ate=fimPeriodo<fimMes?fimPeriodo:fimMes;
  return de<=ate?{modo:'personalizado',de,ate}:null;
}

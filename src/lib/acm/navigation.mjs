export const ACM_AREAS = Object.freeze([
  { id: 'project', icon: '📐', label: 'Projeto', initial: 'measures', steps: [['measures', 'Medidas'], ['materials', 'Materiais'], ['modulation', 'Paginação'], ['costs', 'Custos'], ['review', 'Conferência']] },
  { id: 'structure', icon: '🏗️', label: 'Estrutura', initial: 'structure', steps: [['structure', 'Metalon e corte']] },
  { id: 'cut', icon: '✂️', label: 'Corte ACM', initial: 'nesting', steps: [['nesting', 'Plano das chapas'], ['bends', 'Bandejas e fresagem']] },
  { id: 'fixing', icon: '🔩', label: 'Fixações', initial: 'fixing', steps: [['fixing', 'Produtos e mapa']] },
  { id: 'installation', icon: '🧰', label: 'Instalação', initial: 'installation', steps: [['installation', 'Planejamento da instalação']] },
  { id: 'layout', icon: '🎨', label: 'Layout 3D', initial: 'layout3d', steps: [['layout3d', 'Arte e apresentação']] },
  { id: 'documents', icon: '📄', label: 'Documentos', initial: 'documents', steps: [['documents', 'Caderno e arquivos']] },
]);

export function areaForStep(step) {
  return ACM_AREAS.find(area => area.steps.some(([id]) => id === step)) ?? ACM_AREAS[0];
}

/** Presentation assets never cross into a cutting worker or change physical quantities. */
export function productionInput(project) {
  const { visual: _visual, titleBlock: _titleBlock, installation: _installation, ...input } = project;
  const stripPhoto = value => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(stripPhoto);
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'photoDataUrl').map(([key, item]) => [key, stripPhoto(item)]));
  };
  return stripPhoto(input);
}

/** Reject prototype tokens before mutation and never follow inherited properties. */
export function setProjectPath(object,path,value) {
  const keys=Array.isArray(path)?path:String(path).split('.');
  if (!keys.length || keys.some(key=>typeof key!=='string'||!key||['__proto__','prototype','constructor'].includes(key))) throw new Error('Caminho de edição inválido.');
  let at=object;
  for (const key of keys.slice(0,-1)) {
    if (!Object.hasOwn(at,key)||!at[key]||typeof at[key]!=='object') at[key]={};
    at=at[key];
  }
  at[keys.at(-1)]=value;
  return object;
}

// Shared screen/PDF coordinates: display the complete sheet horizontally.
export const FOLD_COLOR='#007cba';
export function placedDrawing(piece,placement){
 const point=([x,y])=>placement.rotated
  ? [placement.y+x,placement.x+piece.blank.height-y]
  : [placement.y+y,placement.x+x];
 return {contour:piece.blank.contour.map(point),folds:piece.blank.grooves.map(g=>({a:point([g.x1,g.y1]),b:point([g.x2,g.y2])}))};
}

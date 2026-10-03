const hex = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255); };
const lin = c => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const L = h => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const [x,y] = [L(a),L(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
const pairs = [
  ['ink.900 on cream.100',      '#1F1A1F', '#FAF4EC', 'body text'],
  ['ink.700 on cream.100',      '#3D353D', '#FAF4EC', 'secondary text'],
  ['ink.500 on cream.100',      '#655C64', '#FAF4EC', 'muted text'],
  ['ink.400 on cream.100',      '#8B828A', '#FAF4EC', 'disabled only'],
  ['plum.600 on cream.100',     '#573351', '#FAF4EC', 'headings / links'],
  ['plum.700 on cream.100',     '#3F2440', '#FAF4EC', 'display headings'],
  ['white on plum.600',         '#FFFFFF', '#573351', 'primary button'],
  ['white on plum.500',         '#FFFFFF', '#6E4360', 'primary button hover'],
  ['white on blush.600',        '#FFFFFF', '#B4584A', 'accent button'],
  ['ink.900 on blush.200',      '#1F1A1F', '#F7DAD4', 'accent surface text'],
  ['ink.900 on sage.200',       '#1F1A1F', '#DCE3DA', 'info surface text'],
  ['white on sage.600',         '#FFFFFF', '#5E7360', 'sage button'],
  ['sage.700 on cream.100',     '#46573F', '#FAF4EC', 'sage text on cream'],
  ['white on success.600',      '#FFFFFF', '#2F6B4F', 'success badge'],
  ['success.600 on success.100','#2F6B4F', '#DFF0E6', 'success soft badge'],
  ['warn.600 on warn.100',      '#8A5A14', '#FBEBD2', 'warning soft badge'],
  ['error.600 on error.100',    '#A32C22', '#FADDDA', 'error soft badge'],
  ['white on error.600',        '#FFFFFF', '#A32C22', 'destructive button'],
  ['info.600 on info.100',      '#2B5B7A', '#DCEAF3', 'info soft badge'],
  ['plum.600 focus on cream',   '#573351', '#FAF4EC', 'focus ring vs page'],
];
let fails = 0;
console.log('pair'.padEnd(30), 'ratio'.padStart(6), ' AA-text AA-large AAA  use');
for (const [n,fg,bg,use] of pairs) {
  const r = ratio(fg,bg);
  const aa = r>=4.5, aaL = r>=3, aaa = r>=7;
  if (!aa) fails++;
  console.log(n.padEnd(30), r.toFixed(2).padStart(6), ' ', aa?'PASS ':'FAIL ', '  ', aaL?'PASS ':'FAIL ', '  ', aaa?'PASS':'-   ', ' ', use);
}
console.log('\nnon-AA-text pairs:', fails, '(expected: ink.400 disabled-only is allowed to fail)');

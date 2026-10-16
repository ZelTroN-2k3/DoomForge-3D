const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../apps/web/src/app/globals.css');
let css = fs.readFileSync(cssPath, 'utf8');

const replacements = [
  // Backgrounds / panels
  { regex: /#(fafafa|ffffff|f4f7f9|f8fbfc|f4fcff|f9f9fa|f4f5f7|f1f1f3)/gi, replace: 'var(--background)' },
  
  // Foregrounds / Text
  { regex: /#(31465d|263f57|213c55|243d56|40586f|28435d|2c455f|254056|173a56|40586c|30363a)/gi, replace: 'var(--foreground)' },
  
  // Muted Text
  { regex: /#(6a7d8f|536a80|708295|7f8f95)/gi, replace: 'var(--muted-strong)' },
  
  // Borders
  { regex: /#(dde2e8|d3dee7|d9e3ea|d8e1e8|d9e3eb|d6e0e8|cfd8e2)/gi, replace: 'var(--border)' },
  
  // Primary & Active
  { regex: /#(009cde|008dcc|0a6f9b|52bfe9|00aeea|4f8edb)/gi, replace: 'var(--primary)' },
  
  // Subbar / Hover Backgrounds
  { regex: /#(edf3f7|eef4f7|e8f6fc|eef3f6)/gi, replace: 'var(--subbar)' },
  
  // rgba mappings (shadows and soft)
  { regex: /rgba\([^)]+\)/gi, replace: (match) => {
      if (match.includes('0, 114, 164') || match.includes('0, 174, 234')) return 'var(--primary)';
      if (match.includes('35, 55, 75') || match.includes('28, 49, 68') || match.includes('0, 0, 0')) return 'var(--shadow)';
      if (match.includes('154, 220, 240')) return 'var(--workplane-soft)';
      return match;
  }}
];

for (const {regex, replace} of replacements) {
  css = css.replace(regex, replace);
}

fs.writeFileSync(cssPath, css);
console.log('Replaced colors in globals.css');

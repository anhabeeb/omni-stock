const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let missing = [];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let parts = content.split(/fetch\s*\(/);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i++) {
      let part = parts[i];
      if (part.trim().startsWith("'/api/") || part.trim().startsWith('"/api/') || part.trim().startsWith('`/api/')) {
        let lookahead = part.substring(0, 300);
        if (!lookahead.includes('Authorization')) {
            missing.push(`${file}: fetch(${lookahead.substring(0, 50)}...)`);
        }
      }
    }
  }
});

if (missing.length > 0) {
  console.log("Missing Authorization in:");
  missing.forEach(m => console.log(m));
} else {
  console.log("All fetch calls have Authorization.");
}

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

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace fetch(`/api/xyz`).then(...)
  content = content.replace(/fetch\((['"`])(\/api\/[^'"`]+)\1\)\.then/g, "fetch($1$2$1, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then");

  // Replace fetch(`/api/xyz`) when it's the only argument, not followed by .then
  content = content.replace(/fetch\((['"`])(\/api\/[^'"`]+)\1\)(?!\s*[,.])/g, "fetch($1$2$1, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })");

  // Handle fetch('/api/xyz', { ... }) across multiple lines
  // We look for fetch(URL, { and inject headers if it doesn't have Authorization
  
  const regex = /fetch\((['"`])(\/api\/[^'"`]+)\1,\s*\{/g;
  let match;
  let newContent = '';
  let lastIndex = 0;
  
  while ((match = regex.exec(content)) !== null) {
    newContent += content.substring(lastIndex, match.index);
    
    // Find the matching closing brace for the options object
    let braceCount = 1;
    let i = match.index + match[0].length;
    let hasHeaders = false;
    let hasAuthorization = false;
    
    // Look ahead to see if it has Authorization
    let lookahead = content.substring(match.index, match.index + 500);
    if (lookahead.includes('Authorization')) {
      newContent += match[0];
      lastIndex = match.index + match[0].length;
      continue;
    }
    
    if (lookahead.includes('headers:')) {
      // It has headers but no Authorization. We need to inject Authorization into headers.
      // This is complex, let's just do a simple replace for `headers: {`
      let injected = match[0];
      newContent += injected;
      lastIndex = match.index + match[0].length;
      continue;
    }

    // No headers, inject headers
    newContent += `fetch(${match[1]}${match[2]}${match[1]}, { headers: { Authorization: \`Bearer \${localStorage.getItem('token')}\` }, `;
    lastIndex = match.index + match[0].length;
  }
  newContent += content.substring(lastIndex);
  content = newContent;
  
  // Now handle the case where `headers: {` exists but no Authorization
  // We can look for `headers: {` inside fetch and inject Authorization
  const headerRegex = /fetch\((['"`])(\/api\/[^'"`]+)\1,\s*\{[\s\S]*?headers:\s*\{/g;
  let newContent2 = '';
  let lastIndex2 = 0;
  while ((match = headerRegex.exec(content)) !== null) {
    newContent2 += content.substring(lastIndex2, match.index);
    let lookahead = content.substring(match.index, match.index + 200);
    if (!lookahead.includes('Authorization')) {
      newContent2 += match[0] + ` Authorization: \`Bearer \${localStorage.getItem('token')}\`, `;
    } else {
      newContent2 += match[0];
    }
    lastIndex2 = match.index + match[0].length;
  }
  newContent2 += content.substring(lastIndex2);
  content = newContent2;

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});

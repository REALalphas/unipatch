const fs = require('fs');
let code = fs.readFileSync('tests/engine.test.ts', 'utf8');
code = code.replace(/remove\('\.\/file1.json'\),\s*remove\('\.\/file2.json'\)/, "remove('!copied_jsons/file1.json'), remove('!copied_jsons/file2.json') // this is getting messy\n");

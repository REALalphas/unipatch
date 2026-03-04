const fs = require('fs');

// Ah, wait. `remove('file1.json')` STILL matches matchBase, so it STILL removes out/copied_jsons/file1.json!
// Because we use minimatch with `matchBase: true` internally.
// We should use `remove('/file1.json')` ? Let's check minimatch docs. matchBase means if no slashes in pattern, it matches basenames anywhere.

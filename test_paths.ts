import { minimatch } from 'minimatch';

const relativePath = 'file1.json';
const trimmedPattern = '*.json';

console.log(minimatch(relativePath, trimmedPattern, { matchBase: true }));

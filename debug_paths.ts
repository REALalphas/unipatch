import { getMatchedPaths } from './src/engine';
import { existsSync, readdirSync } from 'node:fs';

// @ts-ignore
const fs = require('fs');
let code = fs.readFileSync('src/engine.ts', 'utf8');

// The exported module doesn't export getMatchedPaths directly.

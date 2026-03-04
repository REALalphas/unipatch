import { pkg, create, edit, remove, copy, move } from './src/ast';
import { executeAST } from './src/engine';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';

async function run() {
    rmSync('out', { recursive: true, force: true });

    await pkg().put(
        create('file1.json', { a: 1 }),
        create('file2.json', { a: 2 }),
        create('other.txt', 'hello'),
        edit('*.json').set('b', 3),
        copy('*.json', 'copied_jsons'),
        move('other.txt', 'moved_other.txt'),
        remove('f*.json')
    ).execute();

    console.log("Copied file1 exists:", existsSync('out/copied_jsons/file1.json'));
    console.log("Copied file2 exists:", existsSync('out/copied_jsons/file2.json'));
}

run();

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

    console.log("Copied dir exists:", existsSync('out/copied_jsons'));
    console.log("Moved file exists:", existsSync('out/moved_other.txt'));
    console.log("File1 deleted:", !existsSync('out/file1.json'));
    console.log("File2 deleted:", !existsSync('out/file2.json'));
}

run();

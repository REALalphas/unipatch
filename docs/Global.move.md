# Global.move

## Description
Constructs a `MoveNode` representing the relocation of a file or directory tree to a new destination within the project's build directory. The initial file path is destroyed and safely shifted to the new provided path layout. Like `copy`, it offers glob pattern filtering to constrain this behavior to selected contents.

## Syntax
```typescript
move( src, dest, [options] )
```

## Arguments

1. `src` (`string | string[]`) - The path or paths of the folder or file to relocate.
2. `dest` (`string`) - The output destination of the relocated source content.
3. `options` (`FileOpOptions` optional) - An object containing a property like `{ overwrite: boolean }`. By default, moving operations throw an error when attempting to overwrite existing files, unless `{ overwrite: true }` is provided.

## Returns
`MoveNode` - An AST instruction object permitting chained filtering directives with `.only()` and `.ignore()`.

## Examples

### Moving directory contents
Shifts an entire `old_assets/` tree into `new_assets/`.

```typescript
import { pkg, get, move } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo').unpack(),
    move('old_assets/', 'new_assets/')
);
```

### Filtering relocations
In this scenario, a `.txt` file is shifted from its original position while intentionally discarding any markdown files present.

```typescript
import { pkg, get, move } from 'unipatch-engine';

const engine = pkg().put(
    get('github:example/repo').unpack(),
    move('src/', 'dest/')
        .only('*.txt')
        .ignore('*.md')
);
```

## See Also
* [MoveNode](MoveNode.md)
* [Global.copy](Global.copy.md)
* [Global.rename](Global.rename.md)
* [Global.remove](Global.remove.md)

# Global.rename

## Description
Generates a `RenameNode` AST instruction representing the operation to rename a specific file or directory directly within the output build path. Unlike `move()`, it expects a single source path and a target destination.

## Syntax
```typescript
rename( src, dest, [options] )
```

## Arguments

1. `src` (`string`) - The initial path of the folder or file to rename.
2. `dest` (`string`) - The new targeted file or folder path.
3. `options` (`FileOpOptions` optional) - An object containing a property like `{ overwrite: boolean }`. By default, rename operations will throw an error when attempting to overwrite existing files, unless `{ overwrite: true }` is provided.

## Returns
`RenameNode` - The AST node corresponding to this file rename operation.

## Examples

### Renaming a Configuration File
This operation renames a default configuration file extracted from a deployment bundle into a more permanent settings file for the output.

```typescript
import { pkg, get, rename } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo').unpack(),
    rename('config/default.ini', 'config/system.ini')
);
```

## See Also
* [RenameNode](RenameNode.md)
* [Global.move](Global.move.md)
* [Global.copy](Global.copy.md)

# RenameNode

## Description
This class signifies the `Rename` AST node instruction initialized via the `rename()` global function. The instance controls a deliberate renaming action of a specific file or directory tree directly inside the executed workspace.

## Methods
Unlike `CopyNode` and `MoveNode`, `RenameNode` does not expose `.ignore()` and `.only()` glob matching filters, as it performs a direct renaming of the source target layout to the newly specified destination string.

## Examples

### Processing Node Structures
Standard application involves defining the single source location mapped correctly towards the target path without additional chained calls.

```typescript
import { pkg, get, rename } from 'unipatch-engine';

const engine = pkg().put(
    get('github:example/repository').unpack(),

    rename('assets/old_name.png', 'assets/new_name.png')
);
```

## See Also
* [Global.rename](Global.rename.md)
* [MoveNode](MoveNode.md)
* [CopyNode](CopyNode.md)

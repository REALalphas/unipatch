# RemoveNode

## Description
This class defines the `Remove` AST instruction node, created globally via `remove()` or `del()`. The object instructs the pipeline parser engine to forcibly eliminate an entire folder or isolated specific file entry from the compiled final firmware environment.

## Methods
Unlike `EditNode` or `CopyNode`, `RemoveNode` does not include specific chainable filter modifiers and acts solely as an atomic file operation targeted via its argument inputs in the global call interface.

## Properties
* `path` (`string`) - The targeted file or directory structure bound for removal from the generated layout.

## Examples

### Using a RemoveNode Step
The `RemoveNode` simply registers the explicit path string upon initialization.

```typescript
import { pkg, get, remove } from 'unipatch-engine';

const engine = pkg().put(
    get('github:user/mod_pack').unpack(),

    // Generates a RemoveNode explicitly to erase this directory
    remove('unwanted_assets_folder')
);
```

## See Also
* [Global.remove](Global.remove.md)
* [MoveNode](MoveNode.md)

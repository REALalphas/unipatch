# Global.copy

## Description
Generates a `CopyNode` instruction that creates duplicates of targeted files or directories within the generated build environment from a source path to a destination path. It implements filter constraints utilizing glob match strings for ignoring or specifying particular subsets of targets.

## Syntax
```typescript
copy( src, dest )
```

## Arguments

1. `src` (`string`) - The path of the folder or file to duplicate.
2. `dest` (`string`) - The destination path for the copy operation.

## Returns
`CopyNode` - The respective node indicating this AST instruction. It offers chainable helper tools like `.ignore()` and `.only()`.

## Examples

### Copying a generic directory
Copies the initial `templates/` layout into a target `deployment/` location without filtering.

```typescript
import { pkg, get, copy } from 'unipatch-engine';

const engine = pkg().put(
    get('github:example/repo').unpack(),
    copy('templates/', 'deployment/')
);
```

### Copying with filter mechanisms
You can explicitly isolate specific file formats or directory elements with filtering. This example restricts the output to include only YAML configurations, ignoring a specific markdown file entirely.

```typescript
import { pkg, get, copy } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo').unpack(),

    copy('src_config/', 'out_config/')
        .only('*.yaml')
        .ignore('README.md')
);
```

## See Also
* [CopyNode](CopyNode.md)
* [Global.move](Global.move.md)
* [Global.remove](Global.remove.md)

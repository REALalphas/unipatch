# MoveNode

## Description
This class defines the `Move` AST instruction node instantiated by the `move()` global call. The node signals the deployment engine pipeline to shift a folder or specific file path to a separate directory allocation, destroying the original input location once successfully displaced. This file displacement includes chainable glob mechanisms to exclude selective resources from being carried over.

## Methods

### MoveNode.ignore
Supplies an exclusion target string pattern using minimalmatch matching logic. Files triggering the match against this standard are disregarded from the displacement.

#### Syntax
```typescript
ignore( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch string literal indicating what resources to abandon.

#### Returns
`MoveNode` - The respective object instance permitting chained directives.

---

### MoveNode.only
Applies a restrictive inclusion policy utilizing minimalmatch to target files. Resources failing to match the stated constraint do not get executed in the shift output space.

#### Syntax
```typescript
only( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch string literal indicating what files must specifically carry over.

#### Returns
`MoveNode` - The respective object instance permitting chained directives.

## Examples

### Targeting Relocations
By appending filters onto the `MoveNode`, a sequence is structured where any file unassociated with an image format gets successfully disregarded inside a folder displacement task.

```typescript
import { pkg, get, move } from 'unipatch-engine';

const engine = pkg().put(
    get('github:example/repo').unpack(),

    // Only image assets relocate over
    move('old_folder/', 'new_folder/')
        .only('*.{jpg,png,jpeg,webp}')
);
```

## See Also
* [Global.move](Global.move.md)
* [CopyNode](CopyNode.md)

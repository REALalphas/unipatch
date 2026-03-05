# Global.remove

## Description
Constructs a `RemoveNode` AST element instructing the deployer to delete a target path in the final output directory. The aliases `remove()` and `del()` are functionally equivalent and perform the same action.

## Syntax
```typescript
remove( path )
```

Alternatively:
```typescript
del( path )
```

## Arguments

1. `path` (`string`) - The relative file or directory path targeted for deletion.

## Returns
`RemoveNode` - The AST node representing this deletion operation.

## Examples

### Removing bloatware
This example uses the `remove` function to ensure an unwanted directory does not appear in the firmware deployment result.

```typescript
import { pkg, get, remove } from 'unipatch-engine';

const deployer = pkg().put(
    get('github:example/firmware').unpack(),
    remove('bloatware_folder')
);
```

### Deleting templates
This example performs the same operation as above, but uses the `del` alias, deleting unneeded files.

```typescript
import { pkg, get, del } from 'unipatch-engine';

const pipeline = pkg().put(
    get('github:example/firmware').unpack(),
    del('config/templates')
);
```

## See Also
* [RemoveNode](RemoveNode.md)
* [Global.copy](Global.copy.md)

# PackageContext

## Description
The primary execution engine and pipeline builder created by the global `pkg()` function. This object manages the sequentially queued AST instruction nodes array and initiates the final building process of the firmware distribution once definitions are concluded.

## Methods

### PackageContext.put
Appends an arbitrary number of AST operations sequentially to the deployment execution pipeline. This method operates sequentially based on the order arguments are entered, mutating the AST payload with the provided nodes. Returns `PackageContext`, enabling chain-call invocation.

#### Syntax
```typescript
put( ...nodes )
```

#### Arguments
1. `nodes` (`ASTNode[]`) - An indefinite sequence of operation nodes like `GetNode`, `CreateNode`, `EditNode`, `RemoveNode`, `CopyNode`, or `MoveNode`.

#### Returns
`PackageContext` - The mutated context for further sequential chaining operations.

---

### PackageContext.execute
Performs the compilation pipeline on the gathered AST operations. Each instruction within the pipeline sequentially operates in a temporal build environment. Once a step executes correctly, its temporary data merges back recursively into the final generated build structure.

#### Syntax
```typescript
execute()
```

#### Arguments
This function does not take any arguments.

#### Returns
`Promise<void>` - Represents an active execution task completing successfully or raising a failure.

## Examples

### Using Package Context Methods
This illustrates utilizing the `.put()` method multiple times consecutively to construct the sequence, culminating in the usage of the asynchronous `.execute()` function.

```typescript
import { pkg, get, create, edit } from 'unipatch-engine';

async function deploy() {
    const pipeline = pkg();

    // Appending first set of sequential instructions
    pipeline.put(
        get('github:user/main_repo').unpack()
    );

    // Later, further steps can be optionally defined via chainable calls
    pipeline.put(
        create('system/boot.ini', { OS: 'custom' }, { type: 'ini' }),
        edit('settings/config.json').set('display.resolution', '1080p')
    );

    // Build the package and write out changes
    await pipeline.execute();
}

deploy().catch(console.error);
```

## See Also
* [Global.pkg](Global.pkg.md)
* [GetNode](GetNode.md)

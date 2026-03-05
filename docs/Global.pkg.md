# Global.pkg

## Description
Creates a new `PackageContext` pipeline. This function serves as the entry point for defining your declarative firmware deployment steps. It allows you to initialize the environment into which you can sequentially define the modifications and asset acquisitions needed for your final build.

## Syntax
```typescript
pkg()
```

## Arguments
This function does not take any arguments.

## Returns
`PackageContext` - A new package context object, which can be chained with the `.put()` method to sequence abstract syntax tree (AST) nodes.

## Examples

### Basic Usage
This example demonstrates how to initialize a package deployment pipeline and log its execution.

```typescript
import { pkg, get } from 'unipatch-engine';

async function runPipeline() {
    const pipeline = pkg().put(
        get('github:example/repo')
    );

    await pipeline.execute();
}

runPipeline().catch(console.error);
```

## See Also
* [PackageContext](PackageContext.md)
* [Global.get](Global.get.md)

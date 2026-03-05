# Global.edit

## Description
Begins a modification pipeline utilizing an existing configuration. Returns an `EditNode` AST that lets you query and alter an existing file using dot-notation, replacing its structure directly in memory without destroying the original formatting of the parsed configuration file. Note that unlike `create`, `edit` does not immediately overwrite the file.

## Syntax
```typescript
edit( path )
```

## Arguments

1. `path` (`string`) - The relative file path in the build output to target for modification.

## Returns
`EditNode` - A node that enables chainable manipulations utilizing the `set()` and `typeFormat()` methods.

## Examples

### Modifying an existing system configuration
You can use `edit()` to modify deeply nested configuration settings. The `set` method supports recursive dot-notation for nested nodes in JSON, YAML, and INI architectures.

```typescript
import { pkg, get, edit } from 'unipatch-engine';

const pipeline = pkg().put(
    get('github:user/firmware-repo')
        .unpack(),

    edit('config/system_settings.yaml')
        .set('performance.overclock', true)
        .set('ui.theme', 'dark')
);
```

## See Also
* [EditNode](EditNode.md)
* [Global.create](Global.create.md)

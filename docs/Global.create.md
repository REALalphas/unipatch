# Global.create

## Description
Generates a new configuration or flat file on the file system relative to the output build directory. It builds a `CreateNode` AST representing the creation of an entirely new file that can serialize given object content into a structured format (JSON, YAML, INI, or plain text).

## Syntax
```typescript
create( path, [content], [options] )
```

## Arguments

1. `path` (`string`) - The desired destination file path of the new file.
2. `content` (`any` optional) - The payload containing the data structure to serialize. This can be text or an object literal depending on the target format.
3. `options` (`{ type?: FileFormat | 'text' }` optional) - An object containing a `type` property. It overrides the default inference. If omitted, the engine will attempt to infer the format using the file path's extension (`.json`, `.yml`/`.yaml`, `.ini`). Otherwise, it will default to plain text.

## Returns
`CreateNode` - The AST representation of this file generation step.

## Examples

### Generating an INI file
This code generates a boot configuration utilizing INI formatting with an `OS` property.

```typescript
import { pkg, create } from 'unipatch-engine';

const deployer = pkg().put(
    create('system/boot.ini', { OS: 'custom' }, { type: 'ini' })
);
```

### Inferring JSON file format
The code will infer from the file extension that this configuration should be serialized into JSON format.

```typescript
import { pkg, create } from 'unipatch-engine';

const deployer = pkg().put(
    create('config/settings.json', { resolution: '1080p', wifi: true })
);
```

## See Also
* [CreateNode](CreateNode.md)
* [Global.edit](Global.edit.md)

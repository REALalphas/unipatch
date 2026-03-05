# EditNode

## Description
This class defines the `Edit` AST node instruction, which is returned by the `edit()` global function. This object dictates modifications to an existing target data file (YAML, JSON, or INI) utilizing recursive nested-object dot notation without mutating its existing architectural structure or formatting style. The parser utilizes specific file-type matching inference but allows forcing a specific parser when required.

## Methods

### EditNode.typeFormat
Allows forcing the AST operation to interpret the targeted source string using the given text serialization format, avoiding the engine's built-in file extension inference process.

#### Syntax
```typescript
typeFormat( format )
```

#### Arguments
1. `format` (`FileFormat`) - Represents the parser definition target (e.g., `'yaml'`, `'json'`, `'ini'`).

#### Returns
`EditNode` - The object instance allowing chainable definitions.

---

### EditNode.set
Modifies the state of an existing configuration property, replacing its internal value. This function targets nodes inside structures utilizing nested property chains by delimiting with dot notation (e.g., `'display.resolution'`).

#### Syntax
```typescript
set( key, value )
```

#### Arguments
1. `key` (`string`) - The exact property label (or recursive dot-notated node structure) indicating the value to mutate.
2. `value` (`any`) - The serialized data primitive or nested object representation to override with.

#### Returns
`EditNode` - The object instance allowing chainable definitions.

---

### EditNode.clearComments
Instructs the editor to remove all existing textual comments within the configuration source string during the serialization sequence. Note that maintaining standard structure preserves normal inline annotations natively.

#### Syntax
```typescript
clearComments()
```

#### Arguments
This function does not take any arguments.

#### Returns
`EditNode` - The object instance allowing chainable definitions.

## Examples

### Utilizing EditNode Modifications
Using chained `set` modifiers targeting an INI configuration parsed implicitly by the `edit` node's extension string logic. It modifies deeply structured settings safely while wiping its inline documentation natively via the `clearComments` directive.

```typescript
import { pkg, get, edit } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo').unpack(),

    edit('config/system.ini')
        .clearComments()
        .set('Performance.Mode', 'High')
        .set('Network.AllowRoaming', false)
);
```

## See Also
* [Global.edit](Global.edit.md)
* [CreateNode](CreateNode.md)

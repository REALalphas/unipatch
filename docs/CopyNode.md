# CopyNode

## Description
This class defines the `Copy` AST node generated via the `copy()` global function instruction. The node governs cloning a localized source file path or an entire nested directory structure towards a defined output destination inside the build pipeline workspace. Similar to the `GetNode`, this file operation supports granular constraints utilizing minimatch glob patterns.

## Methods

### CopyNode.ignore
Assigns a glob filtering match pattern to deliberately exclude a set of files or directories from being cloned into the specified target destination context.

#### Syntax
```typescript
ignore( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch string literal (e.g., `'*.json'`, `'configs/'`) targeting elements to bypass.

#### Returns
`CopyNode` - The respective object instance allowing chained modifications.

---

### CopyNode.only
Defines an exclusive minimalmatch inclusion constraint that selectively filters which items are copied. All files not meeting this pattern match are discarded during the execution flow.

#### Syntax
```typescript
only( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch string literal.

#### Returns
`CopyNode` - The respective object instance allowing chained modifications.

## Examples

### Utilizing Chainable Filter Sequences
Here, `CopyNode` filters are chained consecutively to restrict the duplication exclusively to `.ini` documents and explicitly exclude any named `default.ini`.

```typescript
import { pkg, get, copy } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo').unpack(),

    copy('source_assets/', 'destination/')
        .only('*.ini')
        .ignore('default.ini')
);
```

## See Also
* [Global.copy](Global.copy.md)
* [MoveNode](MoveNode.md)

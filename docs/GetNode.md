# GetNode

## Description
This class defines the `Get` AST node instruction, which is returned by the `get()` global function. It informs the package engine to download the specified archive resource or artifact, typically a ZIP file from an external repository or static address. Once acquired, it offers chainable configurations to define extraction logic and file-matching behaviors.

## Methods

### GetNode.to
Directs the retrieved artifact or unpacked archive contents into a specific sub-directory within the output build path.

#### Syntax
```typescript
to( folder, [options] )
```

#### Arguments
1. `folder` (`string`) - The target sub-directory to place the artifact or unpacked contents.
2. `options` (`FileOpOptions` optional) - An object representing file operation properties, such as `{ overwrite: boolean }`.

#### Returns
`GetNode` - The object instance allowing chainable modifications.

---

### GetNode.unpack
Instructs the download node to unpack and extract its archive directly into the current sequence's root folder environment.

#### Syntax
```typescript
unpack( [options] )
```

#### Arguments
1. `options` (`UnpackOptions` optional) - An object providing configurations for the unpacking process. By default, unpacked files unconditionally overwrite existing files. Passing `{ overwrite: false }` enforces a pre-check that throws an error if file conflicts exist.

#### Returns
`GetNode` - The object instance allowing chainable modifications.

---

### GetNode.ignore
Defines a glob pattern filter exclusion string, ensuring that matching files present in an archive are inherently discarded during extraction.

#### Syntax
```typescript
ignore( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch glob filtering standard, enabling exclusions like `*.txt` or `docs/`.

#### Returns
`GetNode` - The object instance allowing chainable modifications.

---

### GetNode.only
Specifies a minimalmatch glob filtering string, restricting an unpacked archive's contents strictly to matching files or folders. Any file failing to match is explicitly discarded and never copied to the firmware deployment pipeline root.

#### Syntax
```typescript
only( pattern )
```

#### Arguments
1. `pattern` (`string`) - A minimalmatch glob match string target.

#### Returns
`GetNode` - The object instance allowing chainable modifications.

## Examples

### Utilizing GetNode Chainable Operations
Using the filtering instructions on a package to remove markdown resources and specifically isolate binary modules during the unpacking procedure.

```typescript
import { pkg, get } from 'unipatch-engine';

const deployment = pkg().put(
    get('github:example/repo')
        .unpack()
        .ignore('*.md')
        .only('**/*.nro')
);
```

## See Also
* [Global.get](Global.get.md)
* [PackageContext](PackageContext.md)

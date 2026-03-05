# Global.get

## Description
Creates a `GetNode` AST instruction. This function signals the deployment engine to fetch an artifact from a specified URL, or from GitHub and GitLab repositories using the designated provider syntax.

## Syntax
```typescript
get( url, [options] )
```

## Arguments

1. `url` (`string`) - The location of the resource to acquire. Can be a direct web URL (`https://...`), or utilize provider syntax such as `github:user/repo`, `gitlab:user/repo`, or simply `user/repo` (which defaults to GitHub).
2. `options` (`ProviderOptions` optional) - An object representing query properties for a remote repository provider.

### ProviderOptions properties
When resolving repositories from `github` or `gitlab`, the options argument accepts the following properties:
* `version` (`string` optional) - A target release version (e.g., `'latest'`, `'1.x'`, `'v1.2.3'`). Defaults to `'latest'`.
* `allowPreRelease` (`boolean` optional) - Whether to allow inclusion of pre-release builds in the search. Defaults to `false`.
* `assetPattern` (`string` optional) - A glob pattern to filter and select a specific asset from the release (e.g., `'*windows*.zip'`).
* `headers` (`Record<string, string>` optional) - Custom HTTP headers to pass along with the fetch request, which can be used for authentication.

## Returns
`GetNode` - The respective node representing this AST instruction, allowing chained instructions for extracting and filtering the payload.

## Examples

### Direct URL Download
Fetches a specific zip file directly from a remote web host.

```typescript
import { pkg, get } from 'unipatch-engine';

const pipeline = pkg().put(
    get('https://example.com/assets/mod-pack-v1.zip')
);
```

### GitHub Provider
Requests an asset from a GitHub release that matches the `1.x` pattern and contains `.zip` in its filename.

```typescript
import { pkg, get } from 'unipatch-engine';

const pipeline = pkg().put(
    get('github:atmosphere-nx/atmosphere', {
        version: '1.x',
        assetPattern: 'atmosphere-*.zip'
    })
);
```

## See Also
* [GetNode](GetNode.md)
* [Global.pkg](Global.pkg.md)

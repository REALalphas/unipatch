# Unipatch

This tool serves as a "package manager for custom firmwares" (similar to NPM, but for files, configurations, and modifications on consoles like the Nintendo Switch).

The system uses an Abstract Syntax Tree (AST) combined with a chainable Domain Specific Language (DSL). This allows you to define the final desired state of the firmware deployment sequentially. The engine handles downloading, caching, unpacking, filtering, merging, and configuration editing in isolated temporal environments before outputting the final build.

## Core Concepts

1. **AST & DSL (`pkg()`)**: The entry point for defining your deployment pipeline.
2. **Operations**:
   - `get(url)`: Fetches an artifact from a URL, GitHub, or GitLab repository.
   - `create(path, content, options)`: Generates a new file (JSON, INI, YAML, or plain text).
   - `edit(path)`: Modifies an existing configuration file without destroying its original structure.
   - `remove(path)` (or `del(path)`): Deletes a file or directory from the output structure.
3. **Execution (`.execute()`)**: Only after the full AST is built using `.put()` will the engine perform the steps sequentially.

## Installation

Ensure you have [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) installed.

```bash
bun install
```

## Basic Usage

The engine is completely declarative. You define what you want, and the engine ensures it happens safely.

```typescript
import { pkg, get, create, edit, remove } from 'unipatch-engine';

const pipeline = pkg().put(
    // 1. Download from GitHub, unpack it, and ignore any text files
    get('github:user/firmware-repo', { version: 'latest' })
        .unpack()
        .ignore('*.txt'),

    // 2. Create a new INI configuration file
    create('system/boot.ini', { OS: 'custom' }, { type: 'ini' }),

    // 3. Edit an existing JSON configuration that was extracted in step 1
    edit('settings/config.json')
        .set('display.resolution', '1080p')
        .set('network.wifi', true),

    // 4. Remove a specific folder that is no longer needed
    remove('bloatware_folder')
);

// Execute the pipeline
await pipeline.execute();
```

## Complete E2E Example for Beginners

This example simulates a full end-to-end workflow for a custom firmware deployment.

```typescript
import { pkg, get, create, edit, remove } from './src/index';

async function buildFirmware() {
    console.log("Starting firmware build...");

    const deployer = pkg().put(
        // Step 1: Get the base system
        // We use GitHub releases. We want the 1.x version, and we specify an asset pattern.
        get('github:atmosphere-nx/atmosphere', { 
            version: '1.x',
            assetPattern: 'atmosphere-*.zip'
        }).unpack().ignore('*.md'), // Ignore markdown files

        // Step 2: Download a specific mod (direct URL)
        get('https://example.com/mods/cool-mod-v2.zip')
            .unpack()
            .only('**/*.nro'), // Only extract .nro plugins

        // Step 3: Inject our custom boot splash
        create('boot/splash.ini', { 
            Splash: { 
                enabled: true, 
                timeout: 5000 
            } 
        }, { type: 'ini' }),

        // Step 4: Modify an existing system configuration
        // The file `config/system_settings.yaml` came from the atmosphere zip in Step 1.
        edit('config/system_settings.yaml')
            .set('performance.overclock', true)
            .set('ui.theme', 'dark'),

        // Step 5: Clean up unnecessary default templates
        remove('config/templates')
    );

    // Run the engine
    await deployer.execute();
    
    console.log("Build complete! Check the 'out/' directory.");
}

buildFirmware().catch(console.error);
```

## Advanced Features

### Caching
The engine automatically caches downloads in the `.cache` directory using MD5 hashes. If a build is interrupted or re-run, the engine will verify the `.hash` checksum and reuse the local file, significantly speeding up consecutive builds.

### Isolated Step Execution
During `.execute()`, each operation defined in `put()` runs in an isolated temporary directory (`out/.unipatch_tmp/<timestamp>_step_<index>`). Once the step is successfully completed, its contents are merged recursively into the final `out/` directory. This guarantees that failed operations do not leave the output directory in a corrupted state.

### File Modifiers
The `edit()` and `create()` functions support dot-notation for nested structures. This works seamlessly across JSON, YAML, and INI files.

```typescript
edit('file.json').set('parent.child.property', 'value')
// Results in: { "parent": { "child": { "property": "value" } } }
```

### Git Providers Options

When using `get('github:user/repo')` or `get('gitlab:user/repo')`, you can pass the following options:

- `version`: The release version to target (`'latest'`, `'1.x'`, `'v1.2.3'`).
- `allowPreRelease`: Boolean flag to allow pre-releases (default: `false`).
- `assetPattern`: A glob pattern to select a specific artifact from the release (e.g., `'*windows*.zip'`).
- `headers`: Custom HTTP headers for authentication if needed.

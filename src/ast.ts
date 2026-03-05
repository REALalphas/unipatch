import { type FileFormat } from './parsers'
import { type ProviderOptions } from './providers'
import { executeAST } from './engine'

/**
 * Represents a generic Abstract Syntax Tree node for a deployment step.
 */
export interface ASTNode {
    type: string
}

/**
 * Options for unpacking an archive.
 */
export interface UnpackOptions {
    overwrite?: boolean
}

/**
 * AST Node representing an operation to download or fetch an artifact.
 */
export class GetNode implements ASTNode {
    type = 'Get'
    url: string
    options: ProviderOptions
    shouldUnpack = false
    unpackOptions?: UnpackOptions
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []
    toFolder?: string
    toOptions?: FileOpOptions

    /**
     * @param url The URL or identifier of the artifact to get.
     * @param options Optional provider options (e.g. for GitHub/GitLab).
     */
    constructor(url: string, options: ProviderOptions = {}) {
        this.url = url
        this.options = options
    }

    /**
     * Directs the retrieved artifact or unpacked archive contents into a specific sub-directory.
     * @param folder The target sub-directory.
     * @param options Optional file operation options.
     * @returns The current GetNode instance for chaining.
     */
    to(folder: string, options?: FileOpOptions): this {
        this.toFolder = folder
        this.toOptions = options
        return this
    }

    /**
     * Flags the downloaded artifact to be unpacked (if it's a zip or tar archive).
     * @param options Optional unpack options.
     * @returns The current GetNode instance for chaining.
     */
    unpack(options?: UnpackOptions): this {
        this.shouldUnpack = true
        this.unpackOptions = options
        return this
    }

    /**
     * Adds a glob pattern to ignore specific files during unpacking or copying.
     * @param pattern The glob pattern to ignore.
     * @returns The current GetNode instance for chaining.
     */
    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    /**
     * Adds a glob pattern to include only specific files during unpacking or copying.
     * @param pattern The glob pattern to include.
     * @returns The current GetNode instance for chaining.
     */
    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

/**
 * AST Node representing an operation to create a new file.
 */
export class CreateNode implements ASTNode {
    type = 'Create'
    path: string
    content: any
    format: FileFormat | 'text'

    /**
     * @param path The path of the file to create.
     * @param content The content of the file.
     * @param options Optional options, such as the format type ('json', 'yaml', 'ini', 'text').
     */
    constructor(
        path: string,
        content: any = '',
        options: { type?: FileFormat | 'text' } = {},
    ) {
        this.path = path
        this.content = content
        // Infer format from path or default to text if no type is provided
        this.format = options.type || this.inferFormat(path)
    }

    private inferFormat(path: string): FileFormat | 'text' {
        if (path.endsWith('.json')) return 'json'
        if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml'
        if (path.endsWith('.ini')) return 'ini'
        return 'text'
    }
}

/**
 * AST Node representing an operation to modify an existing file.
 */
export class EditNode implements ASTNode {
    type = 'Edit'
    path: string
    format?: FileFormat
    modifications: { key: string; value: any }[] = []
    shouldClearComments = false

    /**
     * @param path The path of the file to edit.
     */
    constructor(path: string) {
        this.path = path
    }

    /**
     * Explicitly sets the file format for parsing.
     * @param format The file format ('json', 'yaml', 'ini').
     * @returns The current EditNode instance for chaining.
     */
    typeFormat(format: FileFormat): this {
        this.format = format
        return this
    }

    /**
     * Adds a modification operation to set a nested value using a dot-notation key.
     * @param key The dot-notation key.
     * @param value The value to set.
     * @returns The current EditNode instance for chaining.
     */
    set(key: string, value: any): this {
        this.modifications.push({ key, value })
        return this
    }

    /**
     * Indicates that comments should be removed from the file (e.g. INI files).
     * @returns The current EditNode instance for chaining.
     */
    clearComments(): this {
        this.shouldClearComments = true
        return this
    }
}

/**
 * AST Node representing an operation to remove a file or directory.
 */
export class RemoveNode implements ASTNode {
    type = 'Remove'
    path: string

    /**
     * @param path The path of the file or directory to remove.
     */
    constructor(path: string) {
        this.path = path
    }
}

/**
 * Options for file operations such as copy, move, and rename.
 */
export interface FileOpOptions {
    overwrite?: boolean
}

/**
 * AST Node representing an operation to copy files or directories.
 */
export class CopyNode implements ASTNode {
    type = 'Copy'
    src: string | string[]
    dest: string
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []
    options: FileOpOptions

    /**
     * @param src The source path(s) to copy.
     * @param dest The destination path.
     * @param options Optional file operation options.
     */
    constructor(src: string | string[], dest: string, options: FileOpOptions = {}) {
        this.src = src
        this.dest = dest
        this.options = options
    }

    /**
     * Adds a glob pattern to ignore specific files during copying.
     * @param pattern The glob pattern to ignore.
     * @returns The current CopyNode instance for chaining.
     */
    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    /**
     * Adds a glob pattern to include only specific files during copying.
     * @param pattern The glob pattern to include.
     * @returns The current CopyNode instance for chaining.
     */
    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

/**
 * AST Node representing an operation to move files or directories.
 */
export class MoveNode implements ASTNode {
    type = 'Move'
    src: string | string[]
    dest: string
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []
    options: FileOpOptions

    /**
     * @param src The source path(s) to move.
     * @param dest The destination path.
     * @param options Optional file operation options.
     */
    constructor(src: string | string[], dest: string, options: FileOpOptions = {}) {
        this.src = src
        this.dest = dest
        this.options = options
    }

    /**
     * Adds a glob pattern to ignore specific files during moving.
     * @param pattern The glob pattern to ignore.
     * @returns The current MoveNode instance for chaining.
     */
    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    /**
     * Adds a glob pattern to include only specific files during moving.
     * @param pattern The glob pattern to include.
     * @returns The current MoveNode instance for chaining.
     */
    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

/**
 * AST Node representing an operation to rename a file or directory.
 */
export class RenameNode implements ASTNode {
    type = 'Rename'
    src: string
    dest: string
    options: FileOpOptions

    /**
     * @param src The source path to rename.
     * @param dest The new destination path.
     * @param options Optional file operation options.
     */
    constructor(src: string, dest: string, options: FileOpOptions = {}) {
        this.src = src
        this.dest = dest
        this.options = options
    }
}

/**
 * Execution context for collecting and executing a sequence of AST nodes.
 */
export class PackageContext {
    steps: ASTNode[] = []

    /**
     * Adds AST steps to the execution pipeline.
     * @param nodes One or more ASTNode instances.
     * @returns The current PackageContext instance for chaining.
     */
    put(...nodes: ASTNode[]): this {
        this.steps.push(...nodes)
        return this
    }

    /**
     * Executes the collected AST steps.
     */
    async execute(): Promise<void> {
        await executeAST(this.steps)
    }
}

/**
 * Creates a new package context to build an execution pipeline.
 * @returns A new PackageContext instance.
 */
export function pkg(): PackageContext {
    return new PackageContext()
}

/**
 * Creates a new GetNode to fetch an artifact.
 * @param url The URL or identifier of the artifact.
 * @param options Optional provider options.
 * @returns A new GetNode instance.
 */
export function get(url: string, options?: ProviderOptions): GetNode {
    return new GetNode(url, options)
}

/**
 * Creates a new CreateNode to generate a file.
 * @param path The path of the file to create.
 * @param content The content of the file.
 * @param options Optional configuration (e.g. format type).
 * @returns A new CreateNode instance.
 */
export function create(
    path: string,
    content?: any,
    options?: { type?: FileFormat | 'text' },
): CreateNode {
    return new CreateNode(path, content, options)
}

/**
 * Creates a new EditNode to modify an existing file.
 * @param path The path of the file to edit.
 * @returns A new EditNode instance.
 */
export function edit(path: string): EditNode {
    return new EditNode(path)
}

/**
 * Creates a new RemoveNode to delete a file or directory.
 * Named 'del' as standard js export to avoid using reserved keywords if needed.
 * @param path The path of the file or directory to remove.
 * @returns A new RemoveNode instance.
 */
export function del(path: string): RemoveNode {
    return new RemoveNode(path)
}

/**
 * Creates a new RemoveNode to delete a file or directory.
 * @param path The path of the file or directory to remove.
 * @returns A new RemoveNode instance.
 */
export function remove(path: string): RemoveNode {
    return new RemoveNode(path)
}

/**
 * Creates a new CopyNode to copy files or directories.
 * @param src The source path(s).
 * @param dest The destination path.
 * @param options Optional file operation options.
 * @returns A new CopyNode instance.
 */
export function copy(src: string | string[], dest: string, options?: FileOpOptions): CopyNode {
    return new CopyNode(src, dest, options)
}

/**
 * Creates a new MoveNode to move files or directories.
 * @param src The source path(s).
 * @param dest The destination path.
 * @param options Optional file operation options.
 * @returns A new MoveNode instance.
 */
export function move(src: string | string[], dest: string, options?: FileOpOptions): MoveNode {
    return new MoveNode(src, dest, options)
}

/**
 * Creates a new RenameNode to rename a file or directory.
 * @param src The original source path.
 * @param dest The new destination path.
 * @param options Optional file operation options.
 * @returns A new RenameNode instance.
 */
export function rename(src: string, dest: string, options?: FileOpOptions): RenameNode {
    return new RenameNode(src, dest, options)
}

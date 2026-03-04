import { type FileFormat } from './parsers'
import { type ProviderOptions } from './providers'
import { executeAST } from './engine'

export interface ASTNode {
    type: string
}

export class GetNode implements ASTNode {
    type = 'Get'
    url: string
    options: ProviderOptions
    shouldUnpack = false
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []

    constructor(url: string, options: ProviderOptions = {}) {
        this.url = url
        this.options = options
    }

    unpack(): this {
        this.shouldUnpack = true
        return this
    }

    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

export class CreateNode implements ASTNode {
    type = 'Create'
    path: string
    content: any
    format: FileFormat | 'text'

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

export class EditNode implements ASTNode {
    type = 'Edit'
    path: string
    format?: FileFormat
    modifications: { key: string; value: any }[] = []
    shouldClearComments = false

    constructor(path: string) {
        this.path = path
    }

    typeFormat(format: FileFormat): this {
        this.format = format
        return this
    }

    set(key: string, value: any): this {
        this.modifications.push({ key, value })
        return this
    }

    clearComments(): this {
        this.shouldClearComments = true
        return this
    }
}

export class RemoveNode implements ASTNode {
    type = 'Remove'
    path: string

    constructor(path: string) {
        this.path = path
    }
}

export class CopyNode implements ASTNode {
    type = 'Copy'
    src: string
    dest: string
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []

    constructor(src: string, dest: string) {
        this.src = src
        this.dest = dest
    }

    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

export class MoveNode implements ASTNode {
    type = 'Move'
    src: string
    dest: string
    ignorePatterns: string[] = []
    onlyPatterns: string[] = []

    constructor(src: string, dest: string) {
        this.src = src
        this.dest = dest
    }

    ignore(pattern: string): this {
        this.ignorePatterns.push(pattern)
        return this
    }

    only(pattern: string): this {
        this.onlyPatterns.push(pattern)
        return this
    }
}

export class PackageContext {
    steps: ASTNode[] = []

    /**
     * Adds AST steps to the execution pipeline.
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

export function pkg(): PackageContext {
    return new PackageContext()
}

export function get(url: string, options?: ProviderOptions): GetNode {
    return new GetNode(url, options)
}

export function create(
    path: string,
    content?: any,
    options?: { type?: FileFormat | 'text' },
): CreateNode {
    return new CreateNode(path, content, options)
}

export function edit(path: string): EditNode {
    return new EditNode(path)
}

// Named 'del' or 'remove' as standard js export to avoid using reserved keywords.
export function del(path: string): RemoveNode {
    return new RemoveNode(path)
}

export function remove(path: string): RemoveNode {
    return new RemoveNode(path)
}

export function copy(src: string, dest: string): CopyNode {
    return new CopyNode(src, dest)
}

export function move(src: string, dest: string): MoveNode {
    return new MoveNode(src, dest)
}

/**
 * Base AST Node class
 */
class ASTNode {
    constructor(nodeType) {
        this.nodeType = nodeType
    }
}

/**
 * Get Node: represents downloading and optionally unpacking a resource
 */
class GetNode extends ASTNode {
    constructor(source, options = {}) {
        super('Get')
        this.source = source
        this.options = options

        this.artifactPattern = null
        this.shouldUnpack = false
        this.unpackFormat = null

        // These will store minimatch patterns
        this.ignorePatterns = []
        this.onlyPatterns = []
    }

    /**
     * Specify the artifact pattern to download from a release (e.g., '*.zip')
     * @param {string} pattern
     * @returns {GetNode}
     */
    artifact(pattern) {
        this.artifactPattern = pattern
        return this
    }

    /**
     * Indicate that the downloaded file should be unpacked
     * @param {string} format Optional format, e.g., 'zip'
     * @returns {GetNode}
     */
    unpack(format = null) {
        this.shouldUnpack = true
        this.unpackFormat = format
        return this
    }

    /**
     * Ignore files matching the pattern
     * @param {string} pattern
     * @returns {GetNode}
     */
    ignore(pattern) {
        this.ignorePatterns.push(pattern)
        return this
    }

    /**
     * Only include files matching the pattern
     * @param {string} pattern
     * @returns {GetNode}
     */
    only(pattern) {
        this.onlyPatterns.push(pattern)
        return this
    }
}

/**
 * Create Node: creates a file or folder
 */
class CreateNode extends ASTNode {
    constructor(targetPath, contents = null, options = {}) {
        super('Create')
        this.targetPath = targetPath
        this.contents = contents // null means folder
        this.options = options // e.g., { type: 'ini' }
    }
}

/**
 * Edit Node: edits an existing file
 */
class EditNode extends ASTNode {
    constructor(targetPath) {
        super('Edit')
        this.targetPath = targetPath
        this.editType = 'raw'
        this.changes = []
    }

    /**
     * Set the file type for editing (e.g., 'ini', 'json')
     * @param {string} typeVal
     * @returns {EditNode}
     */
    type(typeVal) {
        this.editType = typeVal
        return this
    }

    /**
     * Set a value. For ini: set(section, key, value) or set(key, value)
     * For raw: set(search, replace)
     * @param  {...any} args
     * @returns {EditNode}
     */
    set(...args) {
        this.changes.push({ action: 'set', args })
        return this
    }
}

/**
 * Delete Node: deletes a file or folder
 */
class DeleteNode extends ASTNode {
    constructor(targetPath) {
        super('Delete')
        this.targetPath = targetPath
    }
}

/**
 * Put Node: finalizes and moves the resulting structure to a destination
 */
class PutNode extends ASTNode {
    constructor(sourceNode) {
        super('Put')
        this.sourceNode = sourceNode
    }
}

module.exports = {
    ASTNode,
    GetNode,
    CreateNode,
    EditNode,
    DeleteNode,
    PutNode,
}

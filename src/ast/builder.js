const {
    GetNode,
    CreateNode,
    EditNode,
    DeleteNode,
    PutNode,
} = require('./nodes')

class ASTBuilder {
    constructor() {
        this.nodes = []
    }

    /**
     * Start downloading a file or repository
     * @param {string} url The URL or 'user/repo'
     * @param {object} options Additional options
     * @returns {GetNode}
     */
    get(url, options = {}) {
        const node = new GetNode(url, options)
        this.nodes.push(node)
        return node
    }

    /**
     * Create a file or folder
     * @param {string} path The target path
     * @param {string|null} contents Optional contents. If null, a folder is created.
     * @param {object} options Additional options
     * @returns {CreateNode}
     */
    create(path, contents = null, options = {}) {
        const node = new CreateNode(path, contents, options)
        this.nodes.push(node)
        return node
    }

    /**
     * Edit a file
     * @param {string} targetPath The target path
     * @returns {EditNode}
     */
    edit(targetPath) {
        const node = new EditNode(targetPath)
        this.nodes.push(node)
        return node
    }

    /**
     * Delete a file or folder
     * @param {string} path The target path
     * @returns {DeleteNode}
     */
    delete(path) {
        const node = new DeleteNode(path)
        this.nodes.push(node)
        return node
    }

    /**
     * Finalize the structure and prepare it for output
     * @param {GetNode} sourceNode The source node that provides the base structure
     * @returns {PutNode}
     */
    put(sourceNode) {
        if (!(sourceNode instanceof GetNode)) {
            throw new Error(
                `Critical Error: package().put() requires a valid source object obtained from get().`,
            )
        }
        const node = new PutNode(sourceNode)
        this.nodes.push(node)
        return node
    }

    /**
     * Get all collected AST nodes
     * @returns {Array<any>}
     */
    getNodes() {
        return this.nodes
    }

    /**
     * Clear the AST
     */
    clear() {
        this.nodes = []
    }
}

// Global Singleton for the AST builder
const globalBuilder = new ASTBuilder()

module.exports = {
    ASTBuilder,
    globalBuilder,
}

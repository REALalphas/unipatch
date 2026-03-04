const { globalBuilder } = require('./src/ast/builder');
const { executeNodes } = require('./src/core/engine');

/**
 * Initializes the builder and returns a proxy to the global builder.
 * @returns {import('./src/ast/builder').ASTBuilder}
 */
function pkg() {
    return globalBuilder;
}

/**
 * Global function to get a resource and add a GetNode to the AST.
 * @param {string} url The URL or `<user>/<repo>`.
 * @param {object} options Additional options.
 * @returns {import('./src/ast/nodes').GetNode}
 */
function get(url, options = {}) {
    return globalBuilder.get(url, options);
}

/**
 * Global function to create a file or folder and add a CreateNode to the AST.
 * @param {string} path The target path relative to the temporary workspace.
 * @param {string|null} contents Optional contents. If null, creates a folder.
 * @param {object} options Additional options (e.g., `{ type: 'ini' }`).
 * @returns {import('./src/ast/nodes').CreateNode}
 */
function create(path, contents = null, options = {}) {
    return globalBuilder.create(path, contents, options);
}

/**
 * Global function to edit a file and add an EditNode to the AST.
 * @param {string} targetPath The target path relative to the temporary workspace.
 * @returns {import('./src/ast/nodes').EditNode}
 */
function edit(targetPath) {
    return globalBuilder.edit(targetPath);
}

/**
 * Global function to delete a file or folder and add a DeleteNode to the AST.
 * @param {string} path The target path relative to the temporary workspace.
 * @returns {import('./src/ast/nodes').DeleteNode}
 */
function del(path) {
    return globalBuilder.delete(path);
}

/**
 * Global function to execute the built AST nodes.
 * @returns {Promise<void>}
 */
async function execute() {
    const nodes = globalBuilder.getNodes();
    await executeNodes(nodes);
    globalBuilder.clear(); // Reset for subsequent executions if any
}

module.exports = {
    pkg,
    get,
    create,
    edit,
    del, // Export del as del, handle 'delete' in consumer by destructuring
    delete: del, // Also export as delete for consistency when possible
    execute
};

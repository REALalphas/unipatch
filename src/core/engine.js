const fs = require('fs')
const path = require('path')
const ini = require('ini')
const { minimatch } = require('minimatch')
const { resolveUrl } = require('../utils/resolver')
const { downloadFile } = require('../utils/downloader')
const FileUtils = require('../utils/fs')

const TMP_DIR = path.join(process.cwd(), '.unipatch_tmp')
const OUT_DIR = path.join(process.cwd(), 'out')

/**
 * Execute the AST nodes sequence
 * @param {Array<any>} nodes The AST nodes
 */
async function executeNodes(nodes) {
    if (nodes.length === 0) {
        console.log('No steps to execute.')
        return
    }

    FileUtils.cleanDirectory(TMP_DIR)
    console.log(`[Unipatch] Initializing Execution Engine...`)

    let stepCounter = 1
    const totalSteps = nodes.length

    let baseSourceNode = null

    try {
        for (const node of nodes) {
            console.log(
                `[Step ${stepCounter}/${totalSteps}] Processing ${node.nodeType}...`,
            )
            await processNode(node)
            stepCounter++
        }
        console.log(`[Unipatch] Execution completed successfully!`)
    } catch (error) {
        console.error(
            `\n[Execution Failed at Step ${stepCounter}/${totalSteps}]`,
        )
        console.error(error.message)
        throw error // Rethrow to let the caller handle it (e.g. exit 1)
    } finally {
        console.log(`[Unipatch] Cleaning up temporary files...`)
        FileUtils.cleanDirectory(TMP_DIR)
        fs.rmdirSync(TMP_DIR)
    }
}

/**
 * Process a single AST node
 * @param {any} node
 */
async function processNode(node) {
    switch (node.nodeType) {
        case 'Get':
            await processGet(node)
            break
        case 'Create':
            await processCreate(node)
            break
        case 'Edit':
            await processEdit(node)
            break
        case 'Delete':
            await processDelete(node)
            break
        case 'Put':
            await processPut(node)
            break
        default:
            throw new Error(
                `Critical Error: Unknown AST node type: ${node.nodeType}`,
            )
    }
}

async function processGet(node) {
    const url = await resolveUrl(node.source, {
        artifactPattern: node.artifactPattern,
        ...node.options,
    })

    console.log(`   -> Downloading from: ${url}`)
    const downloadedFilePath = await downloadFile(url)
    console.log(`   -> Download complete.`)

    if (node.shouldUnpack) {
        if (
            node.unpackFormat &&
            !downloadedFilePath.endsWith(`.${node.unpackFormat}`)
        ) {
            throw new Error(
                `Critical Error: Expected format .${node.unpackFormat} but got something else for ${downloadedFilePath}`,
            )
        }

        console.log(`   -> Unpacking...`)
        // We unpack to a subdirectory named after the node to keep sources isolated initially
        const unpackDir = path.join(TMP_DIR, `source_${Date.now()}`)
        fs.mkdirSync(unpackDir, { recursive: true })

        FileUtils.unpackArchive(downloadedFilePath, unpackDir)

        // After unpack, copy only the required files to the main TMP_DIR (acting as root workspace)
        FileUtils.copyRecursiveSync(
            unpackDir,
            TMP_DIR,
            node.onlyPatterns,
            node.ignorePatterns,
        )

        // Clean the isolated unpack dir
        FileUtils.cleanDirectory(unpackDir)
        fs.rmdirSync(unpackDir)
    } else {
        // If not unpacking, just copy the file directly to the workspace
        const destPath = path.join(TMP_DIR, path.basename(downloadedFilePath))
        fs.copyFileSync(downloadedFilePath, destPath)

        // Note: For single files, .only and .ignore are arguably less useful, but we could apply them.
        // If it matches ignore, we just delete it immediately.
        if (node.ignorePatterns.length > 0) {
            const shouldIgnore = node.ignorePatterns.some((pattern) =>
                minimatch(path.basename(destPath), pattern),
            )
            if (shouldIgnore) {
                fs.unlinkSync(destPath)
            }
        }
    }
    console.log(`   -> Source prepared in temporary workspace.`)
}

async function processCreate(node) {
    const targetPath = path.join(TMP_DIR, node.targetPath)
    console.log(`   -> Creating: ${node.targetPath}`)

    if (node.contents === null) {
        // It's a folder
        fs.mkdirSync(targetPath, { recursive: true })
    } else {
        // It's a file
        const dir = path.dirname(targetPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        let contentToWrite = node.contents
        if (
            node.options &&
            node.options.type === 'ini' &&
            typeof node.contents === 'object'
        ) {
            contentToWrite = ini.stringify(node.contents)
        }

        fs.writeFileSync(targetPath, contentToWrite, 'utf8')
    }
}

async function processEdit(node) {
    const targetPath = path.join(TMP_DIR, node.targetPath)
    console.log(`   -> Editing: ${node.targetPath} (Type: ${node.editType})`)

    if (!fs.existsSync(targetPath)) {
        throw new Error(
            `Critical Error: Cannot edit file ${node.targetPath}. File does not exist.`,
        )
    }

    const content = fs.readFileSync(targetPath, 'utf8')

    if (node.editType === 'ini') {
        const parsed = ini.parse(content)

        for (const change of node.changes) {
            if (change.action === 'set') {
                if (change.args.length === 3) {
                    // set(section, key, value)
                    const [section, key, value] = change.args
                    if (!parsed[section]) parsed[section] = {}
                    parsed[section][key] = value
                } else if (change.args.length === 2) {
                    // set(key, value) at root level
                    const [key, value] = change.args
                    parsed[key] = value
                }
            }
        }

        fs.writeFileSync(targetPath, ini.stringify(parsed), 'utf8')
    } else {
        // Raw edit - basic string replace
        let newContent = content
        for (const change of node.changes) {
            if (change.action === 'set' && change.args.length === 2) {
                const [search, replace] = change.args
                newContent = newContent.replace(search, replace)
            }
        }
        fs.writeFileSync(targetPath, newContent, 'utf8')
    }
}

async function processDelete(node) {
    const targetPath = path.join(TMP_DIR, node.targetPath)
    console.log(`   -> Deleting: ${node.targetPath}`)

    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true })
    } else {
        console.warn(
            `[Warning] Path to delete does not exist: ${node.targetPath}`,
        )
    }
}

async function processPut(node) {
    console.log(`   -> Finalizing and moving to output directory...`)

    // Ensure OUT_DIR exists
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true })
    }

    // Copy everything from TMP_DIR to OUT_DIR
    // We replace anything that was there
    FileUtils.copyRecursiveSync(TMP_DIR, OUT_DIR)

    console.log(`   -> Successfully deployed to ${OUT_DIR}`)
}

module.exports = {
    executeNodes,
    TMP_DIR,
    OUT_DIR,
}

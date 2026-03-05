import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    statSync,
    readdirSync,
    renameSync,
    copyFileSync,
    createWriteStream,
} from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { minimatch } from 'minimatch'

import {
    type ASTNode,
    GetNode,
    CreateNode,
    EditNode,
    RemoveNode,
    CopyNode,
    MoveNode,
    RenameNode,
} from './ast'
import { getProvider } from './providers'
import {
    prepareCacheDir,
    verifyCache,
    markAsCached,
    getCachePath,
} from './cache'
import { modifyContent, parsers } from './parsers'

export const OUT_DIR = 'out'
export const TMP_DIR_BASE = join(OUT_DIR, '.unipatch_tmp')

/**
 * Resolves and sanitizes user-provided paths to prevent path traversal outside of the base directory.
 */
export function resolveSafePath(baseDir: string, userPath: string): string {
    const resolvedBase = resolve(baseDir)
    const resolvedPath = resolve(resolvedBase, userPath)

    const rel = relative(resolvedBase, resolvedPath)
    const isEscaping = rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')
    if (isEscaping || isAbsolute(rel)) {
        throw new Error(`Security Error: Path traversal detected - ${userPath}`)
    }
    return resolvedPath
}

/**
 * Downloads a file from a URL to a specified destination via streaming to avoid OOM for large files.
 */
async function downloadFile(
    url: string,
    dest: string,
    headers: Record<string, string> = {},
): Promise<void> {
    const response = await fetch(url, { headers })
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.statusText}`)
    }
    if (!response.body) {
        throw new Error(`No body in response for ${url}`)
    }
    const fileStream = createWriteStream(dest)
    // Convert Web ReadableStream to Node.js Readable
    const readable = Readable.fromWeb(response.body as any)
    await pipeline(readable, fileStream)
}

/**
 * Recursively copies a directory to another directory.
 */
function copyDirRecursive(src: string, dest: string): void {
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true })
    }
    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath)
        } else {
            copyFileSync(srcPath, destPath)
        }
    }
}

/**
 * Recursively checks if any files from `src` already exist in `dest`.
 * Returns an array of paths relative to `src` that exist in `dest`.
 */
function checkConflicts(src: string, dest: string): string[] {
    const conflicts: string[] = []
    if (!existsSync(src) || !existsSync(dest)) return conflicts

    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)

        if (entry.isDirectory()) {
            conflicts.push(...checkConflicts(srcPath, destPath))
        } else if (existsSync(destPath)) {
            conflicts.push(destPath)
        }
    }
    return conflicts
}

/**
 * Recursively moves all contents of a directory into another directory, merging directories instead of replacing them.
 */
function moveDirContents(src: string, dest: string): void {
    if (!existsSync(src)) return
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true })
    }
    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)

        if (entry.isDirectory()) {
            moveDirContents(srcPath, destPath)
            // After moving children, remove the now empty source directory
            rmSync(srcPath, { recursive: true, force: true })
        } else {
            if (existsSync(destPath)) {
                rmSync(destPath, { force: true })
            }
            renameSync(srcPath, destPath)
        }
    }
}

/**
 * Applies filters (ignore/only) to files in a directory recursively.
 */
function applyFilters(
    dir: string,
    baseDir: string,
    ignorePatterns: string[],
    onlyPatterns: string[],
): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relativePath = fullPath
            .replace(baseDir + '/', '')
            .replace(baseDir + '\\', '')

        let shouldKeep = true

        // Apply onlyPatterns first (if any provided)
        if (onlyPatterns.length > 0) {
            shouldKeep = onlyPatterns.some((pattern) =>
                minimatch(relativePath, pattern, { matchBase: true }),
            )
        }

        // Apply ignorePatterns
        if (shouldKeep && ignorePatterns.length > 0) {
            if (
                ignorePatterns.some((pattern) =>
                    minimatch(relativePath, pattern, { matchBase: true }),
                )
            ) {
                shouldKeep = false
            }
        }

        if (!shouldKeep) {
            rmSync(fullPath, { recursive: true, force: true })
        } else if (entry.isDirectory()) {
            applyFilters(fullPath, baseDir, ignorePatterns, onlyPatterns)
            // After filtering children, if dir is empty, remove it
            if (readdirSync(fullPath).length === 0) {
                rmSync(fullPath, { recursive: true, force: true })
            }
        }
    }
}


/**
 * Recursively gets all paths in a directory that match a glob pattern or multiple patterns.
 */
function getMatchedPaths(baseDir: string, pattern: string | string[]): string[] {
    const patterns = Array.isArray(pattern)
        ? pattern.map(p => p.trim())
        : [pattern.trim()]

    const matched: string[] = []

    function traverse(currentDir: string) {
        if (!existsSync(currentDir)) return
        const entries = readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = join(currentDir, entry.name)
            const relativePath = fullPath
                .replace(baseDir + '/', '')
                .replace(baseDir + '\\', '')

            const isMatch = patterns.some(p => minimatch(relativePath, p, { matchBase: true }))
            if (isMatch) {
                matched.push(fullPath)
            }

            if (entry.isDirectory()) {
                traverse(fullPath)
            }
        }
    }

    traverse(baseDir)
    return matched
}

export async function executeAST(steps: ASTNode[]): Promise<void> {
    // 1. Setup out directory
    if (existsSync(OUT_DIR)) {
        rmSync(OUT_DIR, { recursive: true, force: true })
    }
    mkdirSync(OUT_DIR, { recursive: true })

    const timestamp = Date.now()

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        if (!step) continue

        console.log(`[Step ${i + 1}/${steps.length}] Executing ${step.type}...`)

        const stepTmpDir = join(TMP_DIR_BASE, `${timestamp}_step_${i}`)
        mkdirSync(stepTmpDir, { recursive: true })

        try {
            if (step instanceof GetNode) {
                await executeGet(step, stepTmpDir)
            } else if (step instanceof CreateNode) {
                await executeCreate(step, stepTmpDir)
            } else if (step instanceof EditNode) {
                await executeEdit(step, stepTmpDir)
            } else if (step instanceof RemoveNode) {
                await executeRemove(step, stepTmpDir)
            } else if (step instanceof CopyNode) {
                await executeCopy(step, stepTmpDir)
            } else if (step instanceof MoveNode) {
                await executeMove(step, stepTmpDir)
            } else if (step instanceof RenameNode) {
                await executeRename(step, stepTmpDir)
            }

            if (step instanceof GetNode && step.shouldUnpack) {
                const overwrite = step.unpackOptions?.overwrite !== false
                if (!overwrite) {
                    const conflicts = checkConflicts(stepTmpDir, OUT_DIR)
                    if (conflicts.length > 0) {
                        throw new Error(`Cannot unpack because the following files already exist and overwrite is false: ${conflicts.join(', ')}`)
                    }
                }
            }

            // Move contents from stepTmpDir to OUT_DIR (overwriting)
            moveDirContents(stepTmpDir, OUT_DIR)
        } finally {
            // Clean up the specific step temp dir
            if (existsSync(stepTmpDir)) {
                rmSync(stepTmpDir, { recursive: true, force: true })
            }
        }
    }

    // Clean up base TMP directory
    if (existsSync(TMP_DIR_BASE)) {
        rmSync(TMP_DIR_BASE, { recursive: true, force: true })
    }
}

async function executeGet(step: GetNode, stepTmpDir: string): Promise<void> {
    let destDir = stepTmpDir
    if (step.toFolder) {
        destDir = resolveSafePath(stepTmpDir, step.toFolder)
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
        }
    }

    if (step.url.startsWith('local:')) {
        const localPath = resolve(process.cwd(), step.url.replace('local:', ''))

        if (!existsSync(localPath)) {
            throw new Error(`Local path not found: ${localPath}`)
        }

        const stat = statSync(localPath)
        const filename = localPath.split(/[/\\]/).pop() || 'local_file'

        if (stat.isDirectory()) {
            if (step.shouldUnpack) {
                // If directory and unpack, copy contents directly to destDir
                copyDirRecursive(localPath, destDir)
            } else {
                // Otherwise, copy directory itself into destDir
                const targetDir = join(destDir, filename)
                copyDirRecursive(localPath, targetDir)
            }
        } else {
            if (step.shouldUnpack) {
                if (filename.endsWith('.zip')) {
                    const zip = new AdmZip(localPath)

                    // Mitigate Zip Slip vulnerability
                    for (const entry of zip.getEntries()) {
                        const destPath = resolve(destDir, entry.entryName)
                        resolveSafePath(destDir, destPath) // Throws if path traversal
                    }

                    zip.extractAllTo(destDir, true)
                } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
                    tar.x({
                        file: localPath,
                        cwd: destDir,
                        sync: true,
                        onentry: (entry) => {
                            const destPath = join(destDir, entry.path)
                            resolveSafePath(destDir, destPath) // Mitigate Tar Slip
                        }
                    })
                } else {
                    throw new Error(`Unsupported archive format for unpacking: ${filename}`)
                }
            } else {
                copyFileSync(localPath, join(destDir, filename))
            }
        }

        // Apply filters directly to destDir
        if (step.ignorePatterns.length > 0 || step.onlyPatterns.length > 0) {
            applyFilters(
                destDir,
                destDir,
                step.ignorePatterns,
                step.onlyPatterns,
            )
        }
        return
    }

    let downloadUrl = step.url
    let filename = step.url.split('/').pop() || 'downloaded_file'

    const provider = getProvider(step.url)
    if (provider) {
        const asset = await provider.resolveAsset(step.options)
        downloadUrl = asset.url
        filename = asset.filename
    }

    // Check Cache
    const isCached = await verifyCache(step.url, filename)
    let cachedFilePath = join(getCachePath(step.url), filename)

    if (!isCached) {
        cachedFilePath = prepareCacheDir(step.url, filename)
        await downloadFile(downloadUrl, cachedFilePath, step.options.headers)
        await markAsCached(step.url, filename)
    }

    if (step.shouldUnpack) {
        if (filename.endsWith('.zip')) {
            const zip = new AdmZip(cachedFilePath)

            // Mitigate Zip Slip vulnerability
            for (const entry of zip.getEntries()) {
                // AdmZip entryName can have bad characters. We simulate extraction destination:
                const destPath = resolve(destDir, entry.entryName)
                resolveSafePath(destDir, destPath) // Throws if path traversal
            }

            zip.extractAllTo(destDir, true)
        } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
            // Need to manually wrap sync in async wrapper for proper bun compatibility,
            // or use callback structure, but sync is fine since we are in async method context.
            // Using extract synchronously.
            tar.x({
                file: cachedFilePath,
                cwd: destDir,
                sync: true,
                onentry: (entry) => {
                    const destPath = join(destDir, entry.path)
                    resolveSafePath(destDir, destPath) // Mitigate Tar Slip
                }
            })
        } else {
            throw new Error(
                `Unsupported archive format for unpacking: ${filename}`,
            )
        }

        // Apply filters directly to destDir (only when unpacking)
        if (step.ignorePatterns.length > 0 || step.onlyPatterns.length > 0) {
            applyFilters(
                destDir,
                destDir,
                step.ignorePatterns,
                step.onlyPatterns,
            )
        }
    } else {
        copyFileSync(cachedFilePath, join(destDir, filename))
    }
}

async function executeCreate(
    step: CreateNode,
    stepTmpDir: string,
): Promise<void> {
    // We are creating a file conceptually inside OUT_DIR,
    // but practically we create it in stepTmpDir so it gets moved over.
    const destPath = resolveSafePath(stepTmpDir, step.path)
    const destDir = dirname(destPath)
    if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true })
    }

    let contentStr = ''
    if (step.format === 'text') {
        contentStr =
            typeof step.content === 'string'
                ? step.content
                : String(step.content)
    } else {
        const parser = parsers[step.format]
        if (!parser)
            throw new Error(`Unsupported format for create: ${step.format}`)
        contentStr = parser.stringify(step.content)
    }

    writeFileSync(destPath, contentStr, 'utf-8')
}

async function executeEdit(step: EditNode, stepTmpDir: string): Promise<void> {
    resolveSafePath(OUT_DIR, step.path) // Security check
    const pathsToEdit = getMatchedPaths(OUT_DIR, step.path)

    if (pathsToEdit.length === 0) {
        throw new Error(
            `Cannot edit ${step.path}: No matching files found in the output directory.`,
        )
    }

    for (const outFilePath of pathsToEdit) {
        if (!statSync(outFilePath).isFile()) continue

        const relativePath = outFilePath.replace(OUT_DIR + '/', '').replace(OUT_DIR + '\\', '')
        const tmpFilePath = join(stepTmpDir, relativePath)

        // Move file from out to tmp
        const tmpDir = dirname(tmpFilePath)
        if (!existsSync(tmpDir)) {
            mkdirSync(tmpDir, { recursive: true })
        }
        renameSync(outFilePath, tmpFilePath)

        // Read, edit, and write
        const content = readFileSync(tmpFilePath, 'utf-8')

        // Infer format if not provided
        let format = step.format
        if (!format) {
            if (relativePath.endsWith('.json')) format = 'json'
            else if (relativePath.endsWith('.yaml') || relativePath.endsWith('.yml'))
                format = 'yaml'
            else if (relativePath.endsWith('.ini')) format = 'ini'
            else
                throw new Error(
                    `Cannot infer file format for ${relativePath}. Please specify format using .typeFormat().`,
                )
        }

        const modifiedContent = modifyContent(
            content,
            format,
            step.modifications,
            step.shouldClearComments,
        )
        writeFileSync(tmpFilePath, modifiedContent, 'utf-8')
    }
}

async function executeRemove(
    step: RemoveNode,
    stepTmpDir: string,
): Promise<void> {
    resolveSafePath(OUT_DIR, step.path) // Security check
    const pathsToRemove = getMatchedPaths(OUT_DIR, step.path)

    // Sort descending by length to remove deepest paths first, preventing parent deletion before children
    pathsToRemove.sort((a, b) => b.length - a.length)

    for (const outFilePath of pathsToRemove) {
        if (existsSync(outFilePath)) {
            rmSync(outFilePath, { recursive: true, force: true })
        }
    }
}

async function executeCopy(step: CopyNode, stepTmpDir: string): Promise<void> {
    if (typeof step.src === 'string') {
        resolveSafePath(OUT_DIR, step.src) // Security check
    } else {
        step.src.forEach((p) => resolveSafePath(OUT_DIR, p))
    }

    resolveSafePath(stepTmpDir, step.dest) // Security check
    const matchedPaths = getMatchedPaths(OUT_DIR, step.src)

    if (matchedPaths.length === 0) {
        throw new Error(`Cannot copy ${step.src}: No matching source files found.`)
    }

    const isArraySource = Array.isArray(step.src)
    const isDestExplicitDir = step.dest.endsWith('/') || step.dest.endsWith('\\')
    const isDestDir = isArraySource || isDestExplicitDir

    if (matchedPaths.length > 1 && !isDestDir) {
        throw new Error(
            `Cannot copy multiple files to a single file path without a trailing slash: ${step.dest}`
        )
    }

    for (const srcPath of matchedPaths) {
        let destTmpPath = resolveSafePath(stepTmpDir, step.dest)

        if (isDestDir) {
            const baseName = require('node:path').basename(srcPath)
            destTmpPath = resolveSafePath(destTmpPath, baseName)
        }

        // Compute final out dir path to check for overwrite logic
        const relPath = relative(stepTmpDir, destTmpPath)
        const finalDestPath = join(OUT_DIR, relPath)
        if (existsSync(finalDestPath) && !step.options.overwrite) {
            throw new Error(`Destination file already exists and overwrite is false: ${step.dest}`)
        }

        const stat = statSync(srcPath)
        if (stat.isDirectory()) {
            copyDirRecursive(srcPath, destTmpPath)
            // Apply filters to copied directory
            if (step.ignorePatterns.length > 0 || step.onlyPatterns.length > 0) {
                applyFilters(
                    destTmpPath,
                    destTmpPath,
                    step.ignorePatterns,
                    step.onlyPatterns,
                )
            }
        } else {
            const destDir = dirname(destTmpPath)
            if (!existsSync(destDir)) {
                mkdirSync(destDir, { recursive: true })
            }
            copyFileSync(srcPath, destTmpPath)
        }
    }
}

async function executeMove(step: MoveNode, stepTmpDir: string): Promise<void> {
    if (typeof step.src === 'string') {
        resolveSafePath(OUT_DIR, step.src) // Security check
    } else {
        step.src.forEach((p) => resolveSafePath(OUT_DIR, p))
    }

    resolveSafePath(stepTmpDir, step.dest) // Security check
    const matchedPaths = getMatchedPaths(OUT_DIR, step.src)

    if (matchedPaths.length === 0) {
        throw new Error(`Cannot move ${step.src}: No matching source files found.`)
    }

    const isArraySource = Array.isArray(step.src)
    const isDestExplicitDir = step.dest.endsWith('/') || step.dest.endsWith('\\')
    const isDestDir = isArraySource || isDestExplicitDir

    if (matchedPaths.length > 1 && !isDestDir) {
        throw new Error(
            `Cannot move multiple files to a single file path without a trailing slash: ${step.dest}`
        )
    }

    for (const srcPath of matchedPaths) {
        if (!existsSync(srcPath)) continue // Might have been moved as part of a parent directory

        let destTmpPath = resolveSafePath(stepTmpDir, step.dest)

        if (isDestDir) {
            const baseName = require('node:path').basename(srcPath)
            destTmpPath = resolveSafePath(destTmpPath, baseName)
        }

        // Compute final out dir path to check for overwrite logic
        const relPath = relative(stepTmpDir, destTmpPath)
        const finalDestPath = join(OUT_DIR, relPath)
        if (existsSync(finalDestPath) && !step.options.overwrite) {
            throw new Error(`Destination file already exists and overwrite is false: ${step.dest}`)
        }

        const stat = statSync(srcPath)
        if (stat.isDirectory()) {
            copyDirRecursive(srcPath, destTmpPath)
            rmSync(srcPath, { recursive: true, force: true })

            // Apply filters to moved directory
            if (step.ignorePatterns.length > 0 || step.onlyPatterns.length > 0) {
                applyFilters(
                    destTmpPath,
                    destTmpPath,
                    step.ignorePatterns,
                    step.onlyPatterns,
                )
            }
        } else {
            const destDir = dirname(destTmpPath)
            if (!existsSync(destDir)) {
                mkdirSync(destDir, { recursive: true })
            }
            renameSync(srcPath, destTmpPath)
        }
    }
}

async function executeRename(step: RenameNode, stepTmpDir: string): Promise<void> {
    resolveSafePath(OUT_DIR, step.src)
    resolveSafePath(stepTmpDir, step.dest)
    const matchedPaths = getMatchedPaths(OUT_DIR, step.src)

    if (matchedPaths.length === 0) {
        throw new Error(`Cannot rename ${step.src}: No matching source files found.`)
    }

    if (matchedPaths.length > 1) {
        throw new Error(`Cannot rename ${step.src}: Multiple matches found. Use move() or copy() with a trailing slash directory instead.`)
    }

    const srcPath = matchedPaths[0]
    // Tell TS srcPath is definitely defined because length === 1
    if (!srcPath) {
        throw new Error(`Cannot rename ${step.src}: Source path is undefined.`)
    }

    const destTmpPath = resolveSafePath(stepTmpDir, step.dest)

    // Check overwrite logic on final dest path
    const relPath = relative(stepTmpDir, destTmpPath)
    const finalDestPath = join(OUT_DIR, relPath)
    if (existsSync(finalDestPath) && !step.options.overwrite) {
        throw new Error(`Destination already exists and overwrite is false: ${step.dest}`)
    }

    const stat = statSync(srcPath)
    if (stat.isDirectory()) {
        copyDirRecursive(srcPath, destTmpPath)
        rmSync(srcPath, { recursive: true, force: true })
    } else {
        const destDir = dirname(destTmpPath)
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
        }
        renameSync(srcPath, destTmpPath)
    }
}

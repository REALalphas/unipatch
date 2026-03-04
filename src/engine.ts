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
import { join, dirname } from 'node:path'
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

export async function executeAST(steps: ASTNode[]): Promise<void> {
    // 1. Setup out directory
    if (existsSync(OUT_DIR)) {
        rmSync(OUT_DIR, { recursive: true, force: true })
    }
    mkdirSync(OUT_DIR, { recursive: true })

    const timestamp = Date.now()

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
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
            zip.extractAllTo(stepTmpDir, true)
        } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
            // Need to manually wrap sync in async wrapper for proper bun compatibility,
            // or use callback structure, but sync is fine since we are in async method context.
            // Using extract synchronously.
            tar.x({
                file: cachedFilePath,
                cwd: stepTmpDir,
                sync: true,
            })
        } else {
            throw new Error(
                `Unsupported archive format for unpacking: ${filename}`,
            )
        }

        // Apply filters directly to stepTmpDir (only when unpacking)
        if (step.ignorePatterns.length > 0 || step.onlyPatterns.length > 0) {
            applyFilters(
                stepTmpDir,
                stepTmpDir,
                step.ignorePatterns,
                step.onlyPatterns,
            )
        }
    } else {
        copyFileSync(cachedFilePath, join(stepTmpDir, filename))
    }
}

async function executeCreate(
    step: CreateNode,
    stepTmpDir: string,
): Promise<void> {
    // We are creating a file conceptually inside OUT_DIR,
    // but practically we create it in stepTmpDir so it gets moved over.
    const destPath = join(stepTmpDir, step.path)
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
    const outFilePath = join(OUT_DIR, step.path)
    const tmpFilePath = join(stepTmpDir, step.path)

    if (!existsSync(outFilePath)) {
        throw new Error(
            `Cannot edit file ${step.path}: File does not exist in the output directory.`,
        )
    }

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
        if (step.path.endsWith('.json')) format = 'json'
        else if (step.path.endsWith('.yaml') || step.path.endsWith('.yml'))
            format = 'yaml'
        else if (step.path.endsWith('.ini')) format = 'ini'
        else
            throw new Error(
                `Cannot infer file format for ${step.path}. Please specify format using .typeFormat().`,
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

async function executeRemove(
    step: RemoveNode,
    stepTmpDir: string,
): Promise<void> {
    const outFilePath = join(OUT_DIR, step.path)
    if (existsSync(outFilePath)) {
        rmSync(outFilePath, { recursive: true, force: true })
    }
}

async function executeCopy(step: CopyNode, stepTmpDir: string): Promise<void> {
    const srcPath = join(OUT_DIR, step.src)
    const destTmpPath = join(stepTmpDir, step.dest)

    if (!existsSync(srcPath)) {
        throw new Error(`Cannot copy ${step.src}: Source does not exist.`)
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
        // Note: For a single file, filtering during copy is technically possible,
        // but typically ignore/only apply to directories.
    }
}

async function executeMove(step: MoveNode, stepTmpDir: string): Promise<void> {
    const srcPath = join(OUT_DIR, step.src)
    const destTmpPath = join(stepTmpDir, step.dest)

    if (!existsSync(srcPath)) {
        throw new Error(`Cannot move ${step.src}: Source does not exist.`)
    }

    const stat = statSync(srcPath)
    if (stat.isDirectory()) {
        // Move essentially copies it to stepTmpDir then we delete the original.
        // It gets placed in OUT_DIR later by the moveDirContents step.
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

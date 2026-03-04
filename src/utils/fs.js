const fs = require('fs')
const path = require('path')
const { getMD5 } = require('./hash')
const { minimatch } = require('minimatch')
const AdmZip = require('adm-zip')

/**
 * File utility class for file system operations
 */
class FileUtils {
    /**
     * Recursively copies files from source to destination, with filtering.
     * @param {string} source Source directory
     * @param {string} dest Destination directory
     * @param {Array<string>} includePatterns Patterns to include
     * @param {Array<string>} ignorePatterns Patterns to ignore
     * @param {string} originalSource The root source directory (for relative paths in filtering)
     */
    static copyRecursiveSync(
        source,
        dest,
        includePatterns = [],
        ignorePatterns = [],
        originalSource = null,
    ) {
        if (!fs.existsSync(source)) {
            throw new Error(
                `Critical Error: Source directory does not exist: ${source}`,
            )
        }

        const isDirectory = fs.statSync(source).isDirectory()

        if (isDirectory) {
            fs.mkdirSync(dest, { recursive: true })
            fs.readdirSync(source).forEach((file) => {
                const sourcePath = path.join(source, file)
                const destPath = path.join(dest, file)

                FileUtils.copyRecursiveSync(
                    sourcePath,
                    destPath,
                    includePatterns,
                    ignorePatterns,
                    originalSource || source,
                )
            })
        } else {
            // Use the relative path from the very root of the copy operation
            const rootSource = originalSource || source
            // if rootSource === source, relPath is just basename. Otherwise it's the full relative path
            const relPath = path.relative(rootSource, source)

            // Include logic for single file
            if (includePatterns.length > 0) {
                // To allow e.g. '*.bin' to match 'folder/file.bin', we can match against the basename as well
                // or use globstars like '**/*.bin'. By default minimatch without ** won't match across directories.
                // We'll check if any pattern matches the relPath or the basename.
                const included = includePatterns.some((pattern) =>
                    minimatch(relPath, pattern, { matchBase: true }),
                )
                if (!included) return
            }

            // Ignore logic for single file
            if (ignorePatterns.length > 0) {
                const ignored = ignorePatterns.some((pattern) =>
                    minimatch(relPath, pattern, { matchBase: true }),
                )
                if (ignored) return
            }

            // Ensure destination directory exists since we might have skipped creating empty ones
            const destDir = path.dirname(dest)
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true })
            }

            fs.copyFileSync(source, dest)
        }
    }

    /**
     * Cleans a directory
     * @param {string} dirPath Directory path
     */
    static cleanDirectory(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true })
        }
        fs.mkdirSync(dirPath, { recursive: true })
    }

    /**
     * Unpacks an archive to a destination directory
     * @param {string} sourceFile Source archive file
     * @param {string} destDir Destination directory
     */
    static unpackArchive(sourceFile, destDir) {
        if (sourceFile.endsWith('.zip')) {
            const zip = new AdmZip(sourceFile)
            zip.extractAllTo(destDir, true)
        } else {
            throw new Error(
                `Critical Error: Unsupported archive format for ${sourceFile}. Only .zip is currently supported.`,
            )
        }
    }
}

module.exports = FileUtils

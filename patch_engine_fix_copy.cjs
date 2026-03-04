const fs = require('fs');

let code = fs.readFileSync('src/engine.ts', 'utf8');

const updatedCopy = `async function executeCopy(step: CopyNode, stepTmpDir: string): Promise<void> {
    const matchedPaths = getMatchedPaths(OUT_DIR, step.src)

    if (matchedPaths.length === 0) {
        throw new Error(\`Cannot copy \${step.src}: No matching source files found.\`)
    }

    const isMultiMatch = matchedPaths.length > 1 || /[?*{}\\[\\]]/.test(step.src)

    for (const srcPath of matchedPaths) {
        let destTmpPath = join(stepTmpDir, step.dest)

        if (isMultiMatch) {
            // For multiple files, dest acts as a directory
            const baseName = require('path').basename(srcPath)
            destTmpPath = join(destTmpPath, baseName)
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
}`;

const updatedMove = `async function executeMove(step: MoveNode, stepTmpDir: string): Promise<void> {
    const matchedPaths = getMatchedPaths(OUT_DIR, step.src)

    if (matchedPaths.length === 0) {
        throw new Error(\`Cannot move \${step.src}: No matching source files found.\`)
    }

    const isMultiMatch = matchedPaths.length > 1 || /[?*{}\\[\\]]/.test(step.src)

    // Sort descending by length for moves? Probably fine as is since we are just moving to tmpDir.
    // However, if a directory is moved, we should avoid moving its children individually if they are also matched.
    // For simplicity, just iterate.

    for (const srcPath of matchedPaths) {
        if (!existsSync(srcPath)) continue // Might have been moved as part of a parent directory

        let destTmpPath = join(stepTmpDir, step.dest)

        if (isMultiMatch) {
            // For multiple files, dest acts as a directory
            const baseName = require('path').basename(srcPath)
            destTmpPath = join(destTmpPath, baseName)
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
}`;

code = code.replace(/async function executeCopy[\s\S]*?^async function executeMove/m, updatedCopy + '\n\nasync function executeMove');
code = code.replace(/async function executeMove[\s\S]*/, updatedMove + '\n');
fs.writeFileSync('src/engine.ts', code);

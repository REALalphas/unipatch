import * as yaml from 'yaml'
import * as ini from 'ini'
import JSON5 from 'json5'

export type FileFormat = 'json' | 'yaml' | 'ini'

/**
 * Interface for file parsers.
 */
export interface Parser {
    parse(content: string): any
    stringify(data: any): string
}

export const parsers: Record<FileFormat, Parser> = {
    json: {
        parse: (content: string) => JSON5.parse(content || '{}'),
        stringify: (data: any) => JSON.stringify(data, null, 2),
    },
    yaml: {
        parse: (content: string) => yaml.parse(content || '') || {},
        stringify: (data: any) => yaml.stringify(data),
    },
    ini: {
        // We handle INI modifications manually to preserve comments,
        // but keep these for basic parsing if needed elsewhere.
        parse: (content: string) => ini.parse(content || ''),
        stringify: (data: any) => ini.stringify(data),
    },
}

/**
 * Modifies an INI string directly to preserve comments.
 * It reads line by line, updates existing keys, or appends new ones to the correct section.
 * @param clearComments If true, lines starting with ';' or '#' will be removed.
 */
function modifyIniString(
    content: string,
    modifications: { key: string; value: any }[],
    clearComments: boolean = false,
): string {
    let lines = content.split('\n')

    if (clearComments) {
        // Remove comment lines and trim trailing spaces
        lines = lines.filter((line) => {
            const trimmed = line.trim()
            return !trimmed.startsWith(';') && !trimmed.startsWith('#')
        })
    }

    for (const mod of modifications) {
        // Parse the dot-notation key to find section and actual key
        const parts = mod.key.split('.')
        let targetSection = ''
        let targetKey = mod.key

        if (parts.length > 1 && parts[0]) {
            targetSection = parts[0]
            targetKey = parts.slice(1).join('.')
        }

        let currentSection = ''
        let found = false
        let lastSectionLineIndex = -1

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]?.trim()

            // Check for section header
            const sectionMatch = line?.match(/^\[(.*)\]$/)
            if (sectionMatch && sectionMatch[1]) {
                currentSection = sectionMatch[1]
                if (currentSection === targetSection) {
                    lastSectionLineIndex = i
                }
                continue
            }

            // Track last line of our target section
            if (currentSection === targetSection) {
                lastSectionLineIndex = i
            }

            // If we are in the correct section, look for the key
            if (currentSection === targetSection) {
                if (line?.startsWith(';') || line?.startsWith('#')) {
                    continue
                }

                // Need to escape targetKey for regex matching
                const escapedKey = targetKey.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&',
                )
                const keyRegex = new RegExp(`^${escapedKey}\\s*=(.*)$`)
                if (line && keyRegex.test(line)) {
                    const equalIndex = lines[i]?.indexOf('=')
                    const keyPart = lines[i]?.substring(0, equalIndex)
                    lines[i] = `${keyPart}=${mod.value}`
                    found = true
                    break
                }
            }
        }

        if (!found) {
            // We need to add the key
            const newLine = `${targetKey}=${mod.value}`

            if (targetSection === '') {
                // Global section, add to the bottom of global section
                let insertAt = 0
                while (
                    insertAt < lines.length &&
                    !lines[insertAt]?.trim().match(/^\[(.*)\]$/)
                ) {
                    insertAt++
                }
                lines.splice(insertAt, 0, newLine)
            } else {
                if (lastSectionLineIndex !== -1) {
                    // Append to the end of the existing section
                    lines.splice(lastSectionLineIndex + 1, 0, newLine)
                } else {
                    // Section doesn't exist, append section and key to the end
                    if (
                        lines.length > 0 &&
                        lines[lines.length - 1]?.trim() !== ''
                    ) {
                        lines.push('')
                    }
                    lines.push(`[${targetSection}]`)
                    lines.push(newLine)
                }
            }
        }
    }

    return lines.join('\n')
}

/**
 * Sets a value in an object using a dot-notation key path.
 * Modifies the object in-place.
 * @param obj The object to modify.
 * @param path The dot-notation path (e.g. 'a.b.c').
 * @param value The value to set.
 */
export function setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (!key) {
            throw new Error(
                'Path contains an empty or invalid intermediate key segment',
            )
        }
        if (typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {}
        }
        current = current[key]
    }

    const lastKey = keys[keys.length - 1]!

    if (lastKey === '') {
        throw new Error('Final key in path cannot be an empty string')
    }

    current[lastKey] = value
}

/**
 * Parses content, applies modifications using dot-notation, and returns the stringified result.
 * @param content The original file content.
 * @param format The file format ('json', 'yaml', 'ini').
 * @param modifications An array of { key: string, value: any } to apply.
 * @param clearComments Optional flag to remove comments in formats that support it (like INI).
 * @returns The stringified updated content.
 */
export function modifyContent(
    content: string,
    format: FileFormat,
    modifications: { key: string; value: any }[],
    clearComments: boolean = false,
): string {
    if (format === 'ini') {
        return modifyIniString(content, modifications, clearComments)
    }

    const parser = parsers[format]
    if (!parser) {
        throw new Error(`Unsupported format: ${format}`)
    }

    const data = parser.parse(content)
    for (const mod of modifications) {
        setNestedValue(data, mod.key, mod.value)
    }
    return parser.stringify(data)
}

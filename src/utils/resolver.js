const axios = require('axios')
const { minimatch } = require('minimatch')

/**
 * Resolves a source to a direct download URL.
 *
 * Supports:
 * - Direct URLs: 'https://example.com/file.zip'
 * - GitHub Repository (format: 'user/repo'): Uses GitHub API to get the latest release and find an artifact matching the pattern.
 * - GitHub Releases direct URLs: Uses GitHub API to get the latest release and find an artifact matching the pattern.
 *
 * @param {string} source The source string (direct URL or 'user/repo').
 * @param {object} options Additional options.
 * @returns {Promise<string>} The resolved direct URL to the artifact.
 */
async function resolveUrl(source, options = {}) {
    // Check if it's a GitHub repo in `user/repo` format
    const githubRepoRegex = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/

    // Check if it's a direct URL to a GitHub release
    const githubReleaseUrlRegex =
        /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/releases\/latest$/

    let user, repo

    const matchRepo = source.match(githubRepoRegex)
    const matchUrl = source.match(githubReleaseUrlRegex)

    if (matchRepo) {
        user = matchRepo[1]
        repo = matchRepo[2]
    } else if (matchUrl) {
        user = matchUrl[1]
        repo = matchUrl[2]
    } else if (options.type === 'github' && typeof source === 'string') {
        const parts = source.split('/')
        if (parts.length === 2) {
            user = parts[0]
            repo = parts[1]
        }
    }

    if (user && repo) {
        if (!options.artifactPattern) {
            throw new Error(
                `Critical Error: You must provide an artifact pattern (using .artifact()) when requesting a GitHub release.`,
            )
        }

        // Resolve via GitHub API
        try {
            const apiUrl = `https://api.github.com/repos/${user}/${repo}/releases/latest`
            const response = await axios.get(apiUrl, {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                },
            })

            const assets = response.data.assets

            // Find the artifact that matches the pattern
            for (const asset of assets) {
                if (minimatch(asset.name, options.artifactPattern)) {
                    return asset.browser_download_url
                }
            }

            throw new Error(
                `Critical Error: No artifact found matching '${options.artifactPattern}' in release ${response.data.tag_name} for ${user}/${repo}`,
            )
        } catch (error) {
            if (error.response && error.response.status === 404) {
                throw new Error(
                    `Critical Error: Repository or release not found: ${user}/${repo}`,
                )
            }
            throw new Error(
                `Critical Error: Error resolving GitHub release: ${error.message}`,
            )
        }
    }

    // If it's just a direct URL
    if (source.startsWith('http')) {
        return source
    }

    throw new Error(`Critical Error: Unsupported source format: ${source}`)
}

module.exports = {
    resolveUrl,
}

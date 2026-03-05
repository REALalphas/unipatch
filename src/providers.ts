import { minimatch } from 'minimatch'
import { getCachedProviderData, setCachedProviderData } from './cache'

export interface ProviderOptions {
    version?: string // 'latest', '1.x', exact version, or undefined (defaults to latest)
    allowPreRelease?: boolean
    assetPattern?: string // e.g. 'test_v*buzz*_windows.zip'
    headers?: Record<string, string>
}

export interface ResolvedAsset {
    url: string
    filename: string
}

export abstract class GitProvider {
    protected repo: string

    constructor(repo: string) {
        this.repo = repo
    }

    /**
     * Resolves the best matching asset URL and filename based on options.
     */
    abstract resolveAsset(options: ProviderOptions): Promise<ResolvedAsset>

    /**
     * Helper to match an asset name against a glob pattern.
     */
    protected matchAsset(filename: string, pattern?: string): boolean {
        if (!pattern) return true // If no pattern, take the first one or default
        return minimatch(filename, pattern)
    }
}

export class GitHubProvider extends GitProvider {
    async resolveAsset(options: ProviderOptions): Promise<ResolvedAsset> {
        const {
            version = 'latest',
            allowPreRelease = false,
            assetPattern,
            headers = {},
        } = options

        const apiUrl = `https://api.github.com/repos/${this.repo}/releases`
        const fetchOptions = {
            headers: {
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Unipatch-Engine',
                ...headers,
            },
        }

        let releases: any[] | null = getCachedProviderData('github', this.repo, 60 * 60 * 1000)

        if (!releases) {
            const response = await fetch(apiUrl, fetchOptions)
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch GitHub releases for ${this.repo}: ${response.statusText}`,
                )
            }

            releases = (await response.json()) as any[]
            setCachedProviderData('github', this.repo, releases)
        }

        // Filter out pre-releases if not allowed
        const validReleases = allowPreRelease
            ? releases
            : releases.filter((r) => !r.prerelease)

        if (validReleases.length === 0) {
            throw new Error(`No valid releases found for ${this.repo}`)
        }

        // Find the matching release
        let targetRelease
        if (version === 'latest') {
            targetRelease = validReleases[0] // Assuming GitHub API returns sorted by date (newest first)
        } else {
            // Very basic version matching. E.g. "1.x" or "v1.2.3"
            // For robust versioning, semver package should be used, but keeping it simple as per requirements.
            targetRelease = validReleases.find((r) => {
                const tagName = r.tag_name.replace(/^v/, '')
                const targetVersion = version.replace(/^v/, '')

                if (targetVersion.endsWith('.x')) {
                    const prefix = targetVersion.replace('.x', '')
                    return tagName.startsWith(prefix)
                }
                return tagName === targetVersion
            })

            if (!targetRelease) {
                throw new Error(
                    `No release matching version ${version} found for ${this.repo}`,
                )
            }
        }

        // Find the matching asset
        let targetAsset
        if (assetPattern) {
            targetAsset = targetRelease.assets.find((a: any) =>
                this.matchAsset(a.name, assetPattern),
            )
        } else if (targetRelease.assets.length > 0) {
            targetAsset = targetRelease.assets[0]
        }

        if (!targetAsset) {
            throw new Error(
                `No matching asset found in release ${targetRelease.tag_name} for ${this.repo}`,
            )
        }

        return {
            url: targetAsset.browser_download_url,
            filename: targetAsset.name,
        }
    }
}

export class GitLabProvider extends GitProvider {
    async resolveAsset(options: ProviderOptions): Promise<ResolvedAsset> {
        // Simple implementation for GitLab. GitLab API requires encoded project path.
        const encodedRepo = encodeURIComponent(this.repo)
        const {
            version = 'latest',
            allowPreRelease = false,
            assetPattern,
            headers = {},
        } = options

        const apiUrl = `https://gitlab.com/api/v4/projects/${encodedRepo}/releases`
        const fetchOptions = {
            headers: {
                'User-Agent': 'Unipatch-Engine',
                ...headers,
            },
        }

        let releases: any[] | null = getCachedProviderData('gitlab', this.repo, 60 * 60 * 1000)

        if (!releases) {
            const response = await fetch(apiUrl, fetchOptions)
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch GitLab releases for ${this.repo}: ${response.statusText}`,
                )
            }

            releases = (await response.json()) as any[]
            setCachedProviderData('gitlab', this.repo, releases)
        }

        // GitLab releases don't have a direct `prerelease` flag like GitHub.
        // We'll use a heuristic based on common tag naming conventions to identify pre-releases.
        const isGitLabPreRelease = (release: any): boolean => {
            const tagName = release.tag_name?.toLowerCase() || ''
            return (
                tagName.includes('-alpha') ||
                tagName.includes('-beta') ||
                tagName.includes('-rc') ||
                tagName.includes('-dev')
            ) // Add more common pre-release patterns if needed
        }

        const validReleases = allowPreRelease
            ? releases
            : releases.filter((r) => !isGitLabPreRelease(r))

        if (validReleases.length === 0) {
            throw new Error(`No valid releases found for ${this.repo}`)
        }

        // Find the matching release
        let targetRelease
        if (version === 'latest') {
            targetRelease = validReleases[0]
        } else {
            targetRelease = validReleases.find((r) => {
                const tagName = r.tag_name.replace(/^v/, '')
                const targetVersion = version.replace(/^v/, '')

                if (targetVersion.endsWith('.x')) {
                    const prefix = targetVersion.replace('.x', '')
                    return tagName.startsWith(prefix)
                }
                return tagName === targetVersion
            })

            if (!targetRelease) {
                throw new Error(
                    `No release matching version ${version} found for ${this.repo}`,
                )
            }
        }

        // GitLab assets are stored under `assets.links`
        if (
            !targetRelease.assets ||
            !targetRelease.assets.links ||
            targetRelease.assets.links.length === 0
        ) {
            throw new Error(
                `No assets found in release ${targetRelease.tag_name} for ${this.repo}`,
            )
        }

        let targetAsset
        if (assetPattern) {
            targetAsset = targetRelease.assets.links.find((a: any) =>
                this.matchAsset(a.name, assetPattern),
            )
        } else {
            targetAsset = targetRelease.assets.links[0]
        }

        if (!targetAsset) {
            throw new Error(
                `No matching asset found in release ${targetRelease.tag_name} for ${this.repo}`,
            )
        }

        return {
            url: targetAsset.direct_asset_url || targetAsset.url,
            filename: targetAsset.name,
        }
    }
}

/**
 * Factory function to get the appropriate provider.
 */
export function getProvider(url: string): GitProvider | null {
    // If it's a direct URL, no provider needed (handled separately)
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return null
    }

    // Support formats: github:user/repo, gitlab:user/repo, or just user/repo (defaults to github)
    let providerType = 'github'
    let repoPath = url

    if (url.startsWith('github:')) {
        providerType = 'github'
        repoPath = url.replace('github:', '')
    } else if (url.startsWith('gitlab:')) {
        providerType = 'gitlab'
        repoPath = url.replace('gitlab:', '')
    } else if (!url.includes(':') && url.includes('/')) {
        // Default to GitHub
        providerType = 'github'
        repoPath = url
    } else {
        return null // Not a valid provider format
    }

    if (providerType === 'github') {
        return new GitHubProvider(repoPath)
    } else if (providerType === 'gitlab') {
        return new GitLabProvider(repoPath)
    }

    return null
}

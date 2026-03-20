import { minimatch } from 'minimatch'
import { getCachedProviderData, setCachedProviderData } from './cache'

/**
 * Options used when fetching artifacts from external providers (like GitHub or GitLab).
 */
export interface ProviderOptions {
    /** The version of the release to fetch (e.g., 'latest', '1.x', or an exact version like 'v1.2.3'). Defaults to 'latest'. */
    version?: string
    /** Whether to allow fetching pre-release versions. */
    allowPreRelease?: boolean
    /** An optional glob pattern to filter and select a specific asset from the release (e.g., '*windows*.zip'). */
    assetPattern?: string
    /** Custom headers to send in the fetch request. */
    headers?: Record<string, string>
}

/**
 * Represents the resolved URL and filename for a specific downloaded artifact from a provider.
 */
export interface ResolvedAsset {
    url: string
    filename: string
}

/**
 * An abstract base class for Git-based artifact providers.
 */
export abstract class GitProvider {
    protected repo: string

    /**
     * @param repo The repository identifier (e.g., 'owner/repo').
     */
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

/**
 * A provider implementation for resolving and fetching artifacts from GitHub releases.
 */
export class GitHubProvider extends GitProvider {
    /**
     * Resolves the best matching asset URL and filename from GitHub releases based on options.
     * @param options Configuration for release filtering and fetching.
     * @returns A promise resolving to the final URL and filename of the requested artifact.
     */
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

/**
 * A provider implementation for resolving and fetching artifacts from GitLab releases.
 */
export class GitLabProvider extends GitProvider {
    /**
     * Resolves the best matching asset URL and filename from GitLab releases based on options.
     * @param options Configuration for release filtering and fetching.
     * @returns A promise resolving to the final URL and filename of the requested artifact.
     */
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


/**
 * A provider implementation for resolving and fetching artifacts from LineageOS builds.
 */
export class LineageOSProvider extends GitProvider {
    /**
     * Resolves the best matching asset URL and filename from LineageOS builds based on options.
     * @param options Configuration for release filtering and fetching.
     * @returns A promise resolving to the final URL and filename of the requested artifact.
     */
    async resolveAsset(options: ProviderOptions): Promise<ResolvedAsset> {
        const {
            version = 'latest',
            assetPattern,
            headers = {},
        } = options

        const apiUrl = `https://download.lineageos.org/api/v2/devices/${this.repo}/builds`
        const fetchOptions = {
            headers: {
                'User-Agent': 'Unipatch-Engine',
                ...headers,
            },
        }

        let builds: any[] | null = getCachedProviderData('lineageos', this.repo, 60 * 60 * 1000)

        if (!builds) {
            const response = await fetch(apiUrl, fetchOptions)
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch LineageOS builds for ${this.repo}: ${response.statusText}`,
                )
            }

            builds = (await response.json()) as any[]
            setCachedProviderData('lineageos', this.repo, builds)
        }

        if (builds.length === 0) {
            throw new Error(`No valid builds found for ${this.repo}`)
        }

        // Find the matching build
        let targetBuild
        if (version === 'latest') {
            targetBuild = builds[0] // API returns sorted by date
        } else {
            targetBuild = builds.find((b) => b.version === version)

            if (!targetBuild) {
                throw new Error(
                    `No build matching version ${version} found for ${this.repo}`,
                )
            }
        }

        if (!targetBuild.files || targetBuild.files.length === 0) {
            throw new Error(
                `No files found in build ${targetBuild.version} (${targetBuild.date}) for ${this.repo}`,
            )
        }

        // Find the matching asset
        let targetAsset
        if (assetPattern) {
            targetAsset = targetBuild.files.find((f: any) =>
                this.matchAsset(f.filename, assetPattern),
            )
        } else {
            // Default to the main zip if no pattern provided (type: nightly, usually ends with .zip)
            targetAsset = targetBuild.files.find((f: any) => f.filename.endsWith('.zip')) || targetBuild.files[0]
        }

        if (!targetAsset) {
            throw new Error(
                `No matching asset found in build ${targetBuild.version} (${targetBuild.date}) for ${this.repo}`,
            )
        }

        return {
            url: targetAsset.url,
            filename: targetAsset.filename,
        }
    }
}

export function getProvider(url: string): GitProvider | null {
    // Intercept direct lineageos API URLs and redirect to lineageos provider
    const lineageMatch = url.match(/^https:\/\/download\.lineageos\.org\/api\/v2\/devices\/([^\/]+)\/builds$/)
    if (lineageMatch) {
        return new LineageOSProvider(lineageMatch[1])
    }

    // If it's a direct URL, no provider needed (handled separately)
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return null
    }

    // Support formats: github:user/repo, gitlab:user/repo, lineageos:device, or just user/repo (defaults to github)
    let providerType = 'github'
    let repoPath = url

    if (url.startsWith('lineageos:')) {
        providerType = 'lineageos'
        repoPath = url.replace('lineageos:', '')
    } else if (url.startsWith('github:')) {
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

    if (providerType === 'lineageos') {
        return new LineageOSProvider(repoPath)
    } else if (providerType === 'github') {
        return new GitHubProvider(repoPath)
    } else if (providerType === 'gitlab') {
        return new GitLabProvider(repoPath)
    }

    return null
}

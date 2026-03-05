import { expect, test, describe, mock, afterEach } from 'bun:test'
import { getProvider, GitHubProvider, GitLabProvider } from '../src/providers'

describe('Providers', () => {
    // Save original fetch
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
        // Clean up any test cache files
        const fs = require('node:fs')
        if (fs.existsSync('.cache/providers')) {
            fs.rmSync('.cache/providers', { recursive: true, force: true })
        }
    })

    test('getProvider factory works correctly', () => {
        expect(getProvider('https://example.com/file.zip')).toBeNull()

        const gh = getProvider('user/repo')
        expect(gh).toBeInstanceOf(GitHubProvider)
        expect((gh as any).repo).toBe('user/repo')

        const gh2 = getProvider('github:user/repo')
        expect(gh2).toBeInstanceOf(GitHubProvider)
        expect((gh2 as any).repo).toBe('user/repo')

        const gl = getProvider('gitlab:user/repo')
        expect(gl).toBeInstanceOf(GitLabProvider)
        expect((gl as any).repo).toBe('user/repo')
    })

    test('GitHubProvider resolves asset correctly (latest, no pattern)', async () => {
        const gh = new GitHubProvider('test/repo')

        // Mock fetch
        global.fetch = mock((_url: string | URL, _options?: RequestInit) => {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            tag_name: 'v1.0.0',
                            prerelease: false,
                            assets: [
                                {
                                    name: 'app-linux.zip',
                                    browser_download_url:
                                        'https://github.com/test/repo/releases/download/v1.0.0/app-linux.zip',
                                },
                                {
                                    name: 'app-windows.zip',
                                    browser_download_url:
                                        'https://github.com/test/repo/releases/download/v1.0.0/app-windows.zip',
                                },
                            ],
                        },
                    ]),
            }) as Promise<Response>
        }) as any // Cast to 'any' to satisfy the 'global.fetch' type, which expects properties like 'preconnect'.

        const asset = await gh.resolveAsset({ version: 'latest' })
        expect(asset.filename).toBe('app-linux.zip')
        expect(asset.url).toBe(
            'https://github.com/test/repo/releases/download/v1.0.0/app-linux.zip',
        )
    })

    test('GitHubProvider filters by assetPattern', async () => {
        const gh = new GitHubProvider('test/repo')

        global.fetch = mock((_url: string | URL, _options?: RequestInit) => {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            tag_name: 'v1.0.0',
                            prerelease: false,
                            assets: [
                                {
                                    name: 'test_v1.0.0_mac.zip',
                                    browser_download_url: 'url1',
                                },
                                {
                                    name: 'test_v1.0.0_windows.zip',
                                    browser_download_url: 'url2',
                                },
                            ],
                        },
                    ]),
            }) as Promise<Response>
        }) as any // Cast to 'any' to satisfy the 'global.fetch' type, which expects properties like 'preconnect'.

        const asset = await gh.resolveAsset({
            assetPattern: 'test_v*windows*.zip',
        })
        expect(asset.filename).toBe('test_v1.0.0_windows.zip')
        expect(asset.url).toBe('url2')
    })

    test('GitLabProvider resolves asset correctly', async () => {
        const gl = new GitLabProvider('test/repo')

        global.fetch = mock((_url: string | URL, _options?: RequestInit) => {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            tag_name: 'v1.0.0',
                            assets: {
                                links: [
                                    {
                                        name: 'release.tar.gz',
                                        url: 'https://gitlab.com/test/repo/-/jobs/artifacts/main/raw/release.tar.gz',
                                        direct_asset_url:
                                            'https://gitlab.com/test/repo/-/releases/v1.0.0/downloads/release.tar.gz',
                                    },
                                ],
                            },
                        },
                    ]),
            }) as Promise<Response>
        }) as any // Cast to 'any' to satisfy the 'global.fetch' type, which expects properties like 'preconnect'.

        const asset = await gl.resolveAsset({})
        expect(asset.filename).toBe('release.tar.gz')
        expect(asset.url).toBe(
            'https://gitlab.com/test/repo/-/releases/v1.0.0/downloads/release.tar.gz',
        )
    })

    test('GitHubProvider uses cached releases to avoid redundant API calls', async () => {
        const gh = new GitHubProvider('test/repo-cache')

        let fetchCount = 0

        global.fetch = mock((_url: string | URL, _options?: RequestInit) => {
            fetchCount++
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            tag_name: 'v1.0.0',
                            prerelease: false,
                            assets: [
                                {
                                    name: 'app-linux.zip',
                                    browser_download_url:
                                        'https://github.com/test/repo/releases/download/v1.0.0/app-linux.zip',
                                },
                            ],
                        },
                    ]),
            }) as Promise<Response>
        }) as any

        // First call should trigger fetch
        await gh.resolveAsset({ version: 'latest' })
        expect(fetchCount).toBe(1)

        // Second call should use cache
        await gh.resolveAsset({ version: 'latest' })
        expect(fetchCount).toBe(1) // Should remain 1
    })

    test('GitLabProvider uses cached releases to avoid redundant API calls', async () => {
        const gl = new GitLabProvider('test/repo-cache')

        let fetchCount = 0

        global.fetch = mock((_url: string | URL, _options?: RequestInit) => {
            fetchCount++
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            tag_name: 'v1.0.0',
                            assets: {
                                links: [
                                    {
                                        name: 'release.tar.gz',
                                        url: 'https://gitlab.com/test/repo/-/jobs/artifacts/main/raw/release.tar.gz',
                                        direct_asset_url:
                                            'https://gitlab.com/test/repo/-/releases/v1.0.0/downloads/release.tar.gz',
                                    },
                                ],
                            },
                        },
                    ]),
            }) as Promise<Response>
        }) as any

        // First call should trigger fetch
        await gl.resolveAsset({})
        expect(fetchCount).toBe(1)

        // Second call should use cache
        await gl.resolveAsset({})
        expect(fetchCount).toBe(1) // Should remain 1
    })
})

import { expect, test, describe, mock, afterEach } from 'bun:test'
import { getProvider, GitHubProvider, GitLabProvider, LineageOSProvider } from '../src/providers'
import * as path from 'node:path'
import * as fs from 'node:fs'

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

        const lineage = getProvider('lineageos:nx_tab')
        expect(lineage).toBeInstanceOf(LineageOSProvider)
        expect((lineage as any).repo).toBe('nx_tab')

        const lineageDirect = getProvider('https://download.lineageos.org/api/v2/devices/nx_tab/builds')
        expect(lineageDirect).toBeInstanceOf(LineageOSProvider)
        expect((lineageDirect as any).repo).toBe('nx_tab')
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


    test('LineageOSProvider resolves asset correctly (latest, no pattern)', async () => {
        const lineage = new LineageOSProvider('nx_tab')
        const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock/lineageos_builds.json'), 'utf-8'))

        global.fetch = mock((_url: string | URL | Request, _options?: RequestInit) => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            }) as Promise<Response>
        }) as any

        const asset = await lineage.resolveAsset({ version: 'latest' })
        expect(asset.filename).toBe('lineage-22.2-20260301-nightly-nx_tab-signed.zip')
        expect(asset.url).toBe('https://mirrorbits.lineageos.org/full/nx_tab/20260301/lineage-22.2-20260301-nightly-nx_tab-signed.zip')
    })

    test('LineageOSProvider filters by assetPattern', async () => {
        const lineage = new LineageOSProvider('nx_tab')
        const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock/lineageos_builds.json'), 'utf-8'))

        global.fetch = mock((_url: string | URL | Request, _options?: RequestInit) => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            }) as Promise<Response>
        }) as any

        const asset = await lineage.resolveAsset({ assetPattern: 'boot.img' })
        expect(asset.filename).toBe('boot.img')
        expect(asset.url).toBe('https://mirrorbits.lineageos.org/full/nx_tab/20260301/boot.img')
    })

    test('LineageOSProvider uses cached releases to avoid redundant API calls', async () => {
        const lineage = new LineageOSProvider('nx_tab-cache')
        const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock/lineageos_builds.json'), 'utf-8'))

        let fetchCount = 0

        global.fetch = mock((_url: string | URL | Request, _options?: RequestInit) => {
            fetchCount++
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            }) as Promise<Response>
        }) as any

        // First call should trigger fetch
        await lineage.resolveAsset({ version: 'latest' })
        expect(fetchCount).toBe(1)

        // Second call should use cache
        await lineage.resolveAsset({ version: 'latest' })
        expect(fetchCount).toBe(1) // Should remain 1
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

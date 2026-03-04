const { get, create, edit, del, pkg, execute } = require('../index');
const fs = require('fs');
const path = require('path');

// Helper to mock or prepare
const OUT_DIR = path.join(process.cwd(), 'out');
const CACHE_DIR = path.join(process.cwd(), '.cache');
const TMP_DIR = path.join(process.cwd(), '.unipatch_tmp');

jest.mock('../src/utils/resolver');
jest.mock('../src/utils/downloader');

describe('Declarative Firmware Deployment Engine', () => {

    beforeEach(() => {
        // Clean state
        pkg().clear();
        if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
        if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
        if (fs.existsSync(CACHE_DIR)) fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    });

    afterAll(() => {
        // Cleanup after all tests
        if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
        if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
        if (fs.existsSync(CACHE_DIR)) fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    });

    it('should build the AST correctly', () => {
        const source = get('user/repo', { type: 'github' })
            .artifact('test_*.zip')
            .unpack()
            .ignore('*.txt');

        create('config/settings.ini', '', { type: 'ini' });
        edit('config/settings.ini').type('ini').set('Core', 'Enabled', 'true');
        del('useless_folder');
        pkg().put(source);

        const nodes = pkg().getNodes();

        expect(nodes.length).toBe(5);
        expect(nodes[0].nodeType).toBe('Get');
        expect(nodes[1].nodeType).toBe('Create');
        expect(nodes[2].nodeType).toBe('Edit');
        expect(nodes[3].nodeType).toBe('Delete');
        expect(nodes[4].nodeType).toBe('Put');

        expect(nodes[0].artifactPattern).toBe('test_*.zip');
        expect(nodes[0].shouldUnpack).toBe(true);
        expect(nodes[0].ignorePatterns).toContain('*.txt');
        expect(nodes[2].changes[0].action).toBe('set');
    });

    it('should download a simple file and put it in out/', async () => {
        // We will intercept the resolver to avoid real network call for 'http://example.com/dummy.txt'
        const resolver = require('../src/utils/resolver');
        const downloader = require('../src/utils/downloader');

        resolver.resolveUrl.mockResolvedValue('http://example.com/dummy.txt');
        downloader.downloadFile.mockImplementation(async () => {
             const dummyPath = path.join(CACHE_DIR, 'dummy.txt');
             if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
             fs.writeFileSync(dummyPath, 'Dummy Content');
             return dummyPath;
        });

        create('test_file.txt', 'Hello World');
        create('config.ini', { Core: { Version: '1.0' } }, { type: 'ini' });

        // Use a dummy get just to satisfy put(), we'll mock execute node process for Get
        const source = get('http://example.com/dummy.txt');
        pkg().put(source);

        await execute();

        expect(fs.existsSync(path.join(OUT_DIR, 'test_file.txt'))).toBe(true);
        expect(fs.readFileSync(path.join(OUT_DIR, 'test_file.txt'), 'utf8')).toBe('Hello World');

        const iniContent = fs.readFileSync(path.join(OUT_DIR, 'config.ini'), 'utf8');
        expect(iniContent).toContain('Version=1.0');
    });
});

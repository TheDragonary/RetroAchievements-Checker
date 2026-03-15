import { execFile } from "child_process";
import dolphinTool, { DigestAlgorithm } from "dolphin-tool";
import envPaths from "env-paths";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { allowedExtensions, detectSystemFromExtension, detectSystemFromFolder } from "./systems.js";
import type { Console, Game } from "./types.js";

export async function runScanner(romFolder: string, apiKey?: string) {
    const paths = envPaths("ra-scan");

    const APP_DIR = getAppDir();
    const CACHE_DIR = paths.cache;

    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    const consolesPath = path.join(CACHE_DIR, "consoles.json");
    const supportedPath = path.join(CACHE_DIR, "supported_games.json");
    const unsupportedPath = path.join(CACHE_DIR, "unsupported_games.json");
    const duplicatesPath = path.join(CACHE_DIR, "duplicate_games.json");
    const hashIndexPath = path.join(CACHE_DIR, "hash_index.json");

    const ignoreSet: Set<string> = new Set([
        ".directory",
        "thumbs.db",
        ".ds_store",
    ]);

    const globalHashMap = new Map<string, Game>();

    const execFileAsync = promisify(execFile);

    const HASHER = path.join(
        APP_DIR,
        "bin",
        process.platform === "win32" ? "RAHasher.exe" : "RAHasher"
    );

    if (!fs.existsSync(HASHER)) {
        throw new Error(`RAHasher binary not found at ${HASHER}`);
    }

    function getAppDir(): string {
        if (process.execPath.endsWith("ra-scan") || process.execPath.endsWith("ra-scan.exe")) {
            return path.dirname(process.execPath);
        }
        return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    }

    function setupBinary() {
        if (process.platform === "win32") {
            const binDir = path.join(process.cwd(), "bin");
            process.env.PATH = `${binDir};${process.env.PATH}`;
        }
    }

    async function raHash(consoleId: number, file: string): Promise<string> {
        const { stdout } = await execFileAsync(HASHER, [
            consoleId.toString(),
            file,
        ]);
        if (stdout) return stdout.trim().toLowerCase();
        else throw new Error("Failed to hash file");
    }

    async function hashRvz(file: string): Promise<string> {
        setupBinary();
        const hash = await dolphinTool.verify({
            inputFilename: file,
            digestAlgorithm: DigestAlgorithm.RCHASH
        });
        if (hash.rchash) return hash.rchash;
        else throw new Error("Failed to hash RVZ file");
    }

    async function getConsoleList(): Promise<Console[]> {
        return fetch(
            `https://retroachievements.org/API/API_GetConsoleIDs.php?y=${apiKey}&g=1`
        ).then(r => r.json());
    }

    async function fetchGamesForConsole(consoleId: number, retries = 3, delayMs = 1000): Promise<Game[]> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetch(
                    `https://retroachievements.org/API/API_GetGameList.php?y=${apiKey}&i=${consoleId}&h=1`
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const games: Game[] = await res.json();
                if (!Array.isArray(games)) throw new Error("Invalid response format");
                return games;
            } catch (err) {
                console.warn(`Failed to fetch console ${consoleId} (attempt ${attempt}): ${(err as Error).message}`);
                if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
            }
        }
        return [];
    }

    async function buildAllHashDatabases() {
        let consoles: Console[];
        if (!fs.existsSync(consolesPath)) {
            consoles = await getConsoleList();
            fs.writeFileSync(consolesPath, JSON.stringify(consoles, null, 2));
        } else {
            consoles = JSON.parse(fs.readFileSync(consolesPath, "utf8"));
        }

        for (const c of consoles) {
            console.log(`Loading ${c.Name}...`);
            
            let games: Game[];
            if (!fs.existsSync(path.join(CACHE_DIR, `${c.ID}.json`))) {
                games = await fetchGamesForConsole(c.ID);
                fs.writeFileSync(path.join(CACHE_DIR, `${c.ID}.json`), JSON.stringify(games, null, 2));
            } else {
                games = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${c.ID}.json`), "utf8"));
            }

            for (const game of games) {
                for (const hash of game.Hashes ?? []) {
                    globalHashMap.set(hash.toLowerCase(), game);
                }
            }
        }

        console.log(`Loaded ${globalHashMap.size} hashes`);
    }

    function scanRomFolder(dir: string): string[] {
        const files: string[] = [];

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);

            if (ignoreSet.has(entry.name.toLowerCase())) continue;

            if (entry.isDirectory()) {
                files.push(...scanRomFolder(fullPath));
                continue;
            }

            const ext = path.extname(entry.name).toLowerCase();
            if (!allowedExtensions.has(ext)) continue;

            files.push(fullPath);
        }

        return files;
    }

    function detectConsole(file: string): number | null {
        const relative = getRelative(file);
        const parts = relative.split("/");

        for (const part of parts) {
            const system = detectSystemFromFolder(part);
            if (system) return system;
        }

        const system = detectSystemFromFolder(path.basename(romFolder));
        if (system) return system;

        const ext = path.extname(file).toLowerCase();
        const possible = detectSystemFromExtension(ext);

        if (possible.length === 1) return possible[0] as number | null;

        return null;
    }

    function cleanCache(cache: Map<string, string>) {
        for (const [relative] of cache) {
            const fullPath = path.join(romFolder, relative);
            if (!fs.existsSync(fullPath)) cache.delete(relative);
        }
    }

    function cleanHashIndex(index: Map<string, string[]>) {
        for (const [hash, paths] of index) {
            const valid = paths.filter(p =>
                fs.existsSync(path.join(romFolder, p))
            );

            if (valid.length === 0) {
                index.delete(hash);
            } else {
                index.set(hash, valid);
            }
        }
    }

    function handleDuplicates(
        hashIndex: Map<string, string[]>,
        supportedGames: Map<string, string>,
        unsupportedGames: Map<string, string>,
        globalHashMap: Map<string, Game>
    ): Map<string, string> {
        const duplicateGames = new Map<string, string>();
        let duplicateGroups = 0;
        let duplicateFiles = 0;

        for (const [hash, files] of hashIndex) {
            if (files.length <= 1) continue;

            const [original, ...dupes] = files;
            duplicateGroups++;
            duplicateFiles += files.length;

            const game = globalHashMap.get(hash);
            console.log(`\n${game?.Title ?? "Unknown Game"}`);

            if (!original) continue;
            
            console.log(`+ Original: ${original}`);
            duplicateGames.set(original, hash);

            for (const p of dupes) {
                console.log(`  - ${p}`);
                duplicateGames.set(p, hash);

                supportedGames.delete(p);
                unsupportedGames.delete(p);
            }

            hashIndex.set(hash, [original]);
        }

        if (duplicateGames.size > 0) {
            console.log(`\nDuplicate groups: ${duplicateGroups}`);
            console.log(`Duplicate files: ${duplicateFiles}`);

            fs.writeFileSync(duplicatesPath, JSON.stringify(Object.fromEntries(duplicateGames), null, 2));
            fs.writeFileSync("duplicate_games.txt", Array.from(duplicateGames.keys()).join("\n"));
        } else {
            if (fs.existsSync(duplicatesPath)) fs.unlinkSync(duplicatesPath);
            if (fs.existsSync("duplicate_games.txt")) fs.unlinkSync("duplicate_games.txt");
        }

        return duplicateGames;
    }

    function getRelative(file: string) {
        return path.relative(romFolder, file).replace(/\\/g, "/");
    }

    await buildAllHashDatabases();
    const romFiles = scanRomFolder(romFolder);

    let supportedGames = new Map<string, string>();
    let unsupportedGames = new Map<string, string>();
    let hashIndex = new Map<string, string[]>();

    if (fs.existsSync(supportedPath)) {
        supportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync(supportedPath, "utf8"))));
    }

    if (fs.existsSync(unsupportedPath)) {
        unsupportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync(unsupportedPath, "utf8"))));
    }

    if (fs.existsSync(hashIndexPath)) {
        hashIndex = new Map(Object.entries(JSON.parse(fs.readFileSync(hashIndexPath, "utf8"))) as [string, string[]][]);
    }

    cleanCache(supportedGames);
    cleanCache(unsupportedGames);
    cleanHashIndex(hashIndex);

    for (let i = 0; i < romFiles.length; i++) {
        const file = romFiles[i];
        if (!file) continue;
        const relative = getRelative(file);
        const parts = relative.split("/");
        const folder = parts.length > 1 ? parts[0]!.toUpperCase() : detectSystemFromFolder(path.basename(romFolder)) ? path.basename(romFolder).toUpperCase() : "";
        const ext = path.extname(file).toLowerCase();

        const progress = `[${i + 1}/${romFiles.length}]`;

        const consoleId = detectConsole(file);

        if (!consoleId) {
            console.log(`${progress} ❌ Unknown console: ${file}`);
            continue;
        }

        let hash = supportedGames.get(relative) ?? unsupportedGames.get(relative) ?? null;
        if (hash && !globalHashMap.has(hash)) hash = null;

        if (!hash) {
            try {
                process.stdout.write(`${progress} 🔄 ${folder.padEnd(8)} ${path.basename(file)} -> Hashing...`);
                if (ext === ".rvz") {
                    hash = await hashRvz(file);
                } else {
                    hash = await raHash(consoleId, file);
                }
            } catch (err) {
                if (err instanceof Error) {
                    process.stdout.clearLine(0);
                    process.stdout.cursorTo(0);
                    console.log(`${progress} ❌ ${folder.padEnd(8)} ${path.basename(file)} -> ${err.message}`);
                }
            }
        }

        if (!hash) continue;

        const game = globalHashMap.get(hash);

        if (!hashIndex.has(hash)) hashIndex.set(hash, []);
        const list = hashIndex.get(hash)!;
        const set = new Set(list);
        set.add(relative);
        hashIndex.set(hash, [...set]);

        if (game) supportedGames.set(relative, hash);
        else unsupportedGames.set(relative, hash);

        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(`${progress} ${game ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`);
    }

    console.log(`Supported: ${supportedGames.size} / ${romFiles.length}`);
        
    handleDuplicates(hashIndex, supportedGames, unsupportedGames, globalHashMap);

    fs.writeFileSync(supportedPath, JSON.stringify(Object.fromEntries(supportedGames), null, 2));
    fs.writeFileSync(unsupportedPath, JSON.stringify(Object.fromEntries(unsupportedGames), null, 2));
    fs.writeFileSync(hashIndexPath, JSON.stringify(Object.fromEntries(hashIndex), null, 2));

    fs.writeFileSync("supported_games.txt", Array.from(supportedGames.keys()).join("\n"));
    fs.writeFileSync("unsupported_games.txt", Array.from(unsupportedGames.keys()).join("\n"));
}

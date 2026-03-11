import dolphinTool, { ContainerFormat } from "dolphin-tool";
import { execFile } from "child_process";
import { promisify } from "util";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
dotenv.config({ quiet: true });

const API_KEY = process.env.RA_API_KEY;

interface Console {
    ID: number;
    Name: string;
    IconURL: string;
    Active: boolean;
    IsGameSystem: boolean;
}

interface Game {
    Title: string;
    ID: number;
    ConsoleID: number;
    ConsoleName: string;
    ImageIcon: string;
    NumAchievements: number;
    NumLeaderboards: number;
    Points: number;
    DateModified: string;
    ForumTopicID: number;
    Hashes: string[];
}

const consoleMap: Record<string, number> = {
    NES: 7,
    FDS: 81,
    SNES: 3,
    N64: 2,
    GB: 4,
    GBC: 6,
    GBA: 5,
    NDS: 18,
    DSI: 78,
    GC: 16,
    WII: 19,
    "3DS": 62,
    "WII U": 20,
    GENESIS: 1,
    MD: 1,
    PSX: 12,
    PS1: 12,
    PS2: 21,
    PSP: 41,
};

const extensionMap: Record<string, number> = {
    ".nes": 7,
    ".fds": 81,
    ".sfc": 3,
    ".smc": 3,
    ".gb": 4,
    ".gbc": 6,
    ".gba": 5,
    ".z64": 2,
    ".nds": 18,
    ".3ds": 62,
    ".md": 1,
};

const ignoreSet: Set<string> = new Set([
    ".directory",
    "thumbs.db",
    ".ds_store",
]);

const extensionsToIgnore: string[] = [
    ".ram",
    ".sav",
    ".state",
    ".srm",
    ".png",
    ".jpg",
    ".txt",
    ".cue",
    ".m3u",
];

const globalHashMap = new Map<string, Game>();

const execFileAsync = promisify(execFile);

const HASHER = path.resolve(
    "./bin",
    process.platform === "win32" ? "RAHasher.exe" : "RAHasher",
);

async function raHash(consoleId: number, file: string): Promise<string> {
    const { stdout } = await execFileAsync(HASHER, [
        consoleId.toString(),
        file,
    ]);
    return stdout.trim().toLowerCase();
}

async function hashRvz(consoleId: number, file: string): Promise<string> {
    const tempIso = path.join(os.tmpdir(), `${path.basename(file)}.iso`);
    try {
        await dolphinTool.convert({
            inputFilename: file,
            outputFilename: tempIso,
            containerFormat: ContainerFormat.ISO,
        });
        return await raHash(consoleId, tempIso);
    } finally {
        if (fs.existsSync(tempIso)) fs.unlinkSync(tempIso);
    }
}

async function getConsoleList(): Promise<Console[]> {
    return fetch(
        `https://retroachievements.org/API/API_GetConsoleIDs.php?y=${API_KEY}&g=1`
    ).then(r => r.json());
}

async function fetchGamesForConsole(consoleId: number, retries = 3, delayMs = 1000): Promise<Game[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(
                `https://retroachievements.org/API/API_GetGameList.php?y=${API_KEY}&i=${consoleId}&h=1`
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
    if (!fs.existsSync("./cache")) fs.mkdirSync("./cache");

    let consoles: Console[];
    if (!fs.existsSync("./cache/consoles.json")) {
        consoles = await getConsoleList();
        fs.writeFileSync("./cache/consoles.json", JSON.stringify(consoles, null, 2));
    } else {
        consoles = JSON.parse(fs.readFileSync("./cache/consoles.json", "utf8"));
    }

    for (const c of consoles) {
        console.log(`Loading ${c.Name}...`);
        
        let games: Game[];
        if (!fs.existsSync(`./cache/${c.ID}.json`)) {
            games = await fetchGamesForConsole(c.ID);
            fs.writeFileSync(`./cache/${c.ID}.json`, JSON.stringify(games, null, 2));
        } else {
            games = JSON.parse(fs.readFileSync(`./cache/${c.ID}.json`, "utf8"));
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
        if (extensionsToIgnore.includes(ext)) continue;

        files.push(fullPath);
    }

    return files;
}

function detectConsole(file: string): number | null {
    const relative = getRelative(file);
    const parts = relative.split("/");
    const folder = parts.length > 1 ? parts[0].toUpperCase() : "";

    if (consoleMap[folder]) return consoleMap[folder];
    const ext = path.extname(file).toLowerCase();
    if (extensionMap[ext]) return extensionMap[ext];
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
) {
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

        fs.writeFileSync("./cache/duplicate_games.json", JSON.stringify(Object.fromEntries(duplicateGames), null, 2));
        fs.writeFileSync("duplicate_games.txt", Array.from(duplicateGames.keys()).join("\n"));
    } else {
        if (fs.existsSync("./cache/duplicate_games.json")) fs.unlinkSync("./cache/duplicate_games.json");
        if (fs.existsSync("duplicate_games.txt")) fs.unlinkSync("duplicate_games.txt");
    }

    return duplicateGames;
}

function resolveUserPath(p: string) {
    return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function getRelative(file: string) {
    return path.relative(romFolder, file).replace(/\\/g, "/");
}

const inputPath = process.argv[2];
const romFolder = path.resolve(resolveUserPath(inputPath || "./ROMs"));

await buildAllHashDatabases();
const romFiles = scanRomFolder(romFolder);

let supportedGames = new Map<string, string>();
let unsupportedGames = new Map<string, string>();
let hashIndex = new Map<string, string[]>();

if (fs.existsSync("./cache/supported_games.json")) {
    supportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync("./cache/supported_games.json", "utf8"))));
}

if (fs.existsSync("./cache/unsupported_games.json")) {
    unsupportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync("./cache/unsupported_games.json", "utf8"))));
}

if (fs.existsSync("./cache/hash_index.json")) {
    hashIndex = new Map(Object.entries(JSON.parse(fs.readFileSync("./cache/hash_index.json", "utf8"))) as [string, string[]][]);
}

cleanCache(supportedGames);
cleanCache(unsupportedGames);
cleanHashIndex(hashIndex);

for (let i = 0; i < romFiles.length; i++) {
    const file = romFiles[i];
    const relative = getRelative(file);
    const parts = relative.split("/");
    const folder = parts.length > 1 ? parts[0].toUpperCase() : "";
    const ext = path.extname(file).toLowerCase();

    const progress = `[${i + 1}/${romFiles.length}]`;

    const consoleId = detectConsole(file);

    if (!consoleId) {
        console.log("❌ Unknown console:", file);
        continue;
    }

    let hash = supportedGames.get(relative) ?? unsupportedGames.get(relative) ?? null;
    if (hash && !globalHashMap.has(hash)) hash = null;

    if (!hash) {
        try {
            if (ext === ".rvz") {
                hash = await hashRvz(consoleId, file);
            } else {
                hash = await raHash(consoleId, file);
            }
        } catch (err) {
            if (err instanceof Error) {
                console.log(
                    `❌ ${folder.padEnd(8)} ${path.basename(file)} -> ${err.message}`,
                );
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

    console.log(`${progress} ${game ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`);
}

console.log(`Supported: ${supportedGames.size} / ${romFiles.length}`);
    
handleDuplicates(hashIndex, supportedGames, unsupportedGames, globalHashMap);

fs.writeFileSync("./cache/supported_games.json", JSON.stringify(Object.fromEntries(supportedGames), null, 2));
fs.writeFileSync("./cache/unsupported_games.json", JSON.stringify(Object.fromEntries(unsupportedGames), null, 2));
fs.writeFileSync("./cache/hash_index.json", JSON.stringify(Object.fromEntries(hashIndex), null, 2));

fs.writeFileSync("supported_games.txt", Array.from(supportedGames.keys()).join("\n"));
fs.writeFileSync("unsupported_games.txt", Array.from(unsupportedGames.keys()).join("\n"));

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
    ".3ds": 61,
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
    const folder = path
        .relative("./ROMs", file)
        .split(path.sep)[0]
        .toUpperCase();

    if (consoleMap[folder]) return consoleMap[folder];
    const ext = path.extname(file).toLowerCase();
    if (extensionMap[ext]) return extensionMap[ext];
    return null;
}

await buildAllHashDatabases();
const romFiles = scanRomFolder("./ROMs");

let supportedGames = new Map<string, string>();
let unsupportedGames = new Map<string, string>();

let total = 0;
let supported = 0;

if (fs.existsSync("./cache/supported_games.json")) {
    supportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync("./cache/supported_games.json", "utf8"))));
}

if (fs.existsSync("./cache/unsupported_games.json")) {
    unsupportedGames = new Map(Object.entries(JSON.parse(fs.readFileSync("./cache/unsupported_games.json", "utf8"))));
}

for (const file of romFiles) {
    const folder = path
        .relative("./ROMs", file)
        .split(path.sep)[0]
        .toUpperCase();

    const ext = path.extname(file).toLowerCase();

    const consoleId = detectConsole(file);

    if (!consoleId) {
        console.log("❌ Unknown console:", file);
        continue;
    }

    let hash = supportedGames.has(file) ? supportedGames.get(file) : unsupportedGames.has(file) ? unsupportedGames.get(file) : null;

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

    total++;

    if (!hash) continue;

    const game = globalHashMap.get(hash);

    if (game) {
        supported++;
        supportedGames.set(file, hash);
    } else {
        unsupportedGames.set(file, hash);
    }

    console.log(
        `${game ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`,
    );
}

console.log(`Supported: ${supported} / ${total}`);

fs.writeFileSync("./cache/supported_games.json", JSON.stringify(Object.fromEntries(supportedGames), null, 2));
fs.writeFileSync("./cache/unsupported_games.json", JSON.stringify(Object.fromEntries(unsupportedGames), null, 2));

fs.writeFileSync("supported_games.txt", Array.from(supportedGames.keys()).join("\n"));
fs.writeFileSync("unsupported_games.txt", Array.from(unsupportedGames.keys()).join("\n"));

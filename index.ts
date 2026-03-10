import dolphinTool, { ContainerFormat } from "dolphin-tool";
import { execFile } from "child_process";
import { promisify } from "util";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
dotenv.config({ quiet: true });

const API_KEY = process.env.RA_API_KEY;

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

const consoleFallbacks: Record<number, number[]> = {
    81: [7], // FDS -> NES
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

async function hashRvz(consoleId: number, file: string) {
    const tempIso = path.join(os.tmpdir(), `${path.basename(file)}.iso`);

    await dolphinTool.convert({
        inputFilename: file,
        outputFilename: tempIso,
        containerFormat: ContainerFormat.ISO,
    });

    const hash = await raHash(consoleId, tempIso);

    fs.unlinkSync(tempIso);

    return hash;
}

async function buildHashDatabase(consoleId: number) {
    const games: Game[] = await fetch(
        `https://retroachievements.org/API/API_GetGameList.php?y=${API_KEY}&i=${consoleId}&h=1`,
    ).then((r) => r.json());

    const map = new Map<string, Game>();

    for (const game of games) {
        for (const hash of game.Hashes) {
            map.set(hash.toLowerCase(), game);
        }
    }

    return map;
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

async function getHashDatabase(consoleId: number) {
    if (!hashDatabases.has(consoleId)) {
        const db = await buildHashDatabase(consoleId);
        hashDatabases.set(consoleId, db);
    }
    return hashDatabases.get(consoleId)!;
}

const hashDatabases = new Map<number, Map<string, Game>>();
const romFiles = scanRomFolder("./ROMs");

let supported = 0;
let total = 0;

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

    total++;
    
    let hash;
    try {
        if (ext === ".rvz") {
            hash = await hashRvz(consoleId, file);
        } else {
            hash = await raHash(consoleId, file);
        }
    } catch (err) {
        if (err instanceof Error) {
            console.log(
                `❌ ${folder.padEnd(6)} ${path.basename(file)} -> ${err.message}`,
            );
        }
    }

    if (!hash) continue;

    let game: Game | undefined;
    const db = await getHashDatabase(consoleId);
    game = db.get(hash);

    if (!game && consoleFallbacks[consoleId]) {
        for (const fallback of consoleFallbacks[consoleId]) {
            const fallbackDb = await getHashDatabase(fallback);
            game = fallbackDb.get(hash);
            if (game) break;
        }
    }

    if (game) supported++;

    console.log(
        `${game?.Title ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`,
    );
}

console.log(`Supported: ${supported} / ${total}`);

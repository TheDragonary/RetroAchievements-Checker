import { execFile } from "child_process";
import { promisify } from "util";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
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
    "NES": 7,
    "FDS": 81,
    "SNES": 3,
    "GB": 4,
    "GBC": 6,
    "GBA": 5,
    "N64": 2,
    "NDS": 18,
    "DSI": 78,
    "3DS": 62,
    "GENESIS": 1,
    "MD": 1,
    "PSX": 12,
    "PS1": 12,
    "PS2": 21,
    "PSP": 41,
    "GC": 16,
    "WII": 19,
    "WII U": 20,
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

async function buildHashDatabase(consoleId: number) {
    const games: Game[] = await fetch(
        `https://retroachievements.org/API/API_GetGameList.php?y=${API_KEY}&i=${consoleId}&h=1&f=1`,
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

for (const file of romFiles) {
    const folder = path
        .relative("./ROMs", file)
        .split(path.sep)[0]
        .toUpperCase();

    const consoleId = detectConsole(file);

    if (!consoleId) {
        console.log("❌ Unknown console:", file);
        continue;
    }

    let hash;
    try {
        hash = await raHash(consoleId, file);
    } catch (err) {
        if (err instanceof Error) {
            console.log(
                `❌ ${folder.padEnd(6)} ${path.basename(file)} -> ${err.message}`,
            );
        }
    }

    if (!hash) continue;

    const db = await getHashDatabase(consoleId);
    const game = db.get(hash);

    console.log(
        `${game?.Title ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`,
    );
}

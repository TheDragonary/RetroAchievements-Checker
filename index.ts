import pkg from "node-rcheevos";
const { rhash, ConsoleId } = pkg;
import * as dotenv from "dotenv";
dotenv.config({ quiet: true });
import path from "path";
import fs from "fs";

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

const consoleMap: Record<string, pkg.ConsoleIdValue> = {
    NES: ConsoleId.NINTENDO,
    FDS: ConsoleId.FAMICOM_DISK_SYSTEM,
    SNES: ConsoleId.SUPER_NINTENDO,
    GB: ConsoleId.GAMEBOY,
    GBC: ConsoleId.GAMEBOY_COLOR,
    GBA: ConsoleId.GAMEBOY_ADVANCE,
    N64: ConsoleId.NINTENDO_64,
    NDS: ConsoleId.NINTENDO_DS,
    Genesis: ConsoleId.MEGA_DRIVE,
    MD: ConsoleId.MEGA_DRIVE,
    PSX: ConsoleId.PLAYSTATION,
    PS1: ConsoleId.PLAYSTATION,
    PS2: ConsoleId.PLAYSTATION_2,
    PSP: ConsoleId.PSP,
    GC: ConsoleId.GAMECUBE,
    Wii: ConsoleId.WII,
};

const extensionMap: Record<string, pkg.ConsoleIdValue> = {
    ".nes": ConsoleId.NINTENDO,
    ".fds": ConsoleId.FAMICOM_DISK_SYSTEM,
    ".sfc": ConsoleId.SUPER_NINTENDO,
    ".smc": ConsoleId.SUPER_NINTENDO,
    ".gb": ConsoleId.GAMEBOY,
    ".gbc": ConsoleId.GAMEBOY_COLOR,
    ".gba": ConsoleId.GAMEBOY_ADVANCE,
    ".z64": ConsoleId.NINTENDO_64,
    ".nds": ConsoleId.NINTENDO_DS,
    ".md": ConsoleId.MEGA_DRIVE,
    ".chd": ConsoleId.PLAYSTATION,
    ".bin": ConsoleId.PLAYSTATION,
    ".iso": ConsoleId.PLAYSTATION_2,
    ".rvz": ConsoleId.GAMECUBE,
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

function detectConsole(file: string): pkg.ConsoleIdValue | null {
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
        hash = rhash(consoleId, file);
    } catch (err) {
        if (err instanceof Error) console.log(`❌ ${folder.padEnd(6)} ${path.basename(file)} -> hashing failed (${err.message})`);
    }
    if (!hash) continue;

    const db = await getHashDatabase(consoleId);
    const game = db.get(hash);

    console.log(
        `${game?.Title ? "✅" : "❌"} ${folder.padEnd(8)} ${path.basename(file)} -> ${game?.Title ?? "Not supported"}`,
    );
}

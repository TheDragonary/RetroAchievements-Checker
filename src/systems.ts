import type { SystemDetection } from "./types.js";

export const systems: SystemDetection[] = [
    // Nintendo

    { id: 7, names: ["nes", "famicom"], extensions: [".nes"] },
    { id: 81, names: ["fds", "famicom disk system"], extensions: [".fds"] },

    {
        id: 3,
        names: ["snes", "super nintendo", "super famicom"],
        extensions: [".sfc", ".smc"],
    },

    {
        id: 2,
        names: ["n64", "nintendo 64"],
        extensions: [".z64", ".n64", ".v64"],
    },

    { id: 4, names: ["gb", "gameboy", "game boy"], extensions: [".gb"] },
    { id: 6, names: ["gbc", "gameboy color"], extensions: [".gbc"] },
    { id: 5, names: ["gba", "gameboy advance"], extensions: [".gba"] },

    { id: 18, names: ["ds", "nds", "nintendo ds"], extensions: [".nds"] },
    { id: 78, names: ["dsi"], extensions: [".nds"] },

    { id: 62, names: ["3ds"], extensions: [".3ds", ".cia"] },

    {
        id: 16,
        names: ["gamecube", "gc", "gcn", "ngc"],
        extensions: [".iso", ".gcm", ".rvz"],
    },
    { id: 19, names: ["wii"], extensions: [".iso", ".wbfs", ".rvz"] },
    { id: 20, names: ["wiiu", "wii u"], extensions: [".wud", ".wux"] },

    { id: 28, names: ["virtual boy"], extensions: [".vb"] },

    // Sega

    {
        id: 1,
        names: ["genesis", "mega drive", "megadrive", "md"],
        extensions: [".md", ".gen", ".bin"],
    },
    { id: 11, names: ["master system", "sms"], extensions: [".sms"] },
    { id: 15, names: ["game gear", "gg"], extensions: [".gg"] },

    { id: 9, names: ["sega cd"], extensions: [".cue", ".chd"] },
    { id: 10, names: ["32x"], extensions: [".32x", ".bin"] },

    { id: 39, names: ["saturn"], extensions: [".cue", ".chd"] },
    { id: 40, names: ["dreamcast"], extensions: [".gdi", ".cdi", ".chd"] },

    // Sony

    {
        id: 12,
        names: ["psx", "ps1", "playstation"],
        extensions: [".cue", ".bin", ".chd"],
    },
    { id: 21, names: ["ps2", "playstation2"], extensions: [".iso", ".chd"] },
    { id: 41, names: ["psp"], extensions: [".iso", ".cso"] },

    // NEC

    { id: 8, names: ["pc engine", "turbografx", "tg16"], extensions: [".pce"] },
    { id: 76, names: ["pc engine cd"], extensions: [".cue", ".chd"] },

    // SNK

    { id: 56, names: ["neo geo cd"], extensions: [".cue", ".chd"] },

    // Atari

    { id: 25, names: ["atari 2600"], extensions: [".a26"] },
    { id: 51, names: ["atari 7800"], extensions: [".a78"] },
    { id: 17, names: ["lynx"], extensions: [".lnx"] },
    { id: 28, names: ["jaguar"], extensions: [".j64", ".jag"] },

    // Arcade

    { id: 27, names: ["arcade", "mame"], extensions: [".zip"] },
];

function normalise(str: string) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normaliseExt(ext: string) {
    return ext.startsWith(".") ? ext.toLowerCase() : "." + ext.toLowerCase();
}

export const allowedExtensions = new Set(systems.flatMap((s) => s.extensions));
export const extensionLookup = new Map<string, number[]>();
export const folderLookup = new Map<string, number>();

for (const system of systems) {
    for (const name of system.names) {
        folderLookup.set(normalise(name), system.id);
    }

    for (const ext of system.extensions) {
        const e = normaliseExt(ext);

        if (!extensionLookup.has(e)) {
            extensionLookup.set(e, []);
        }

        extensionLookup.get(e)!.push(system.id);
    }
}

const folderAliasesSorted = [...folderLookup.entries()].sort(
    ([a], [b]) => b.length - a.length
);

export function detectSystemFromFolder(folder: string) {
    const name = normalise(folder);

    for (const [alias, id] of folderAliasesSorted) {
        if (name.includes(alias)) return id;
    }

    return null;
}

export function detectSystemFromExtension(ext: string) {
    return extensionLookup.get(normaliseExt(ext)) ?? [];
}

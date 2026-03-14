# RetroAchievements ROM Scanner

A tool that scans your ROM library and matches each file with its corresponding RetroAchievements entry using the RetroAchievements API.

It calculates ROM hashes and compares them against the official RetroAchievements hash database to identify which games in your collection support achievements.

## Download

If you prefer to use Node.js, go to [Getting Started](https://github.com/TheDragonary/RetroAchievements-ROM-Scanner?tab=readme-ov-file#getting-started) and follow the instructions there. Otherwise, you can download the precompiled binaries from [Releases](https://github.com/TheDragonary/RetroAchievements-ROM-Scanner/releases). We also have an [NPM package](https://www.npmjs.com/package/ra-scan) available too.

- [Windows](https://github.com/TheDragonary/RetroAchievements-ROM-Scanner/releases/latest/download/ra-scan-windows-x64.zip)
- [Linux](https://github.com/TheDragonary/RetroAchievements-ROM-Scanner/releases/latest/download/ra-scan-linux-x64.tar.gz)

## Usage

```bash
Usage: ra-scan [options] <roms>

Arguments:
  roms                 ROM folder to scan

Options:
  -V, --version        output the version number
  -k, --api-key <key>  RetroAchievements API key
  -c, --clear-cache    clear cache before scanning
  -h, --help           display help for command
```

### Examples:

Scan a folder:
```bash
ra-scan -k YOUR_API_KEY ./ROMs/
```

Clear cache and rescan:
```bash
ra-scan -k YOUR_API_KEY -c ./ROMs/
```

Windows:
```pwsh
.\ra-scan.exe -k YOUR_API_KEY ./ROMs/
```

## Features

- Scans a ROM library and detects supported RetroAchievements games
- Uses the official RetroAchievements hash database
- Supports compressed and disc formats (CHD, RVZ)
- Automatically detects console from folder name or file extension
- Caches RetroAchievements console and game data
- Caches previously calculated ROM hashes for faster rescans
- Generates lists of supported and unsupported games
- Detects duplicate games

## Supported Systems

- NES
- SNES
- Nintendo 64
- Game Boy / Color / Advance
- Nintendo DS / DSi
- Nintendo GameCube
- Nintendo Wii
- Sega Master System
- Sega Genesis / Mega Drive
- PlayStation
- PlayStation 2
- PlayStation Portable
- And more

## Output

The script will:
- Scan all ROM files inside the ROMs directory
- Detect the console for each ROM
- Calculate the RetroAchievements hash
- Compare the hash against the official database
- Cache API responses locally
- Cache calculated ROM hashes
- Output supported, unsupported games and any duplicates
- Display total supported games
- Save results to text files

Example output:
```
✅ NES      Super Mario Bros. (World).nes -> Super Mario Bros.
✅ SNES     Chrono Trigger (USA).sfc -> Chrono Trigger
❌ SNES     Super Mario World (Europe).sfc -> Not supported
```

## Getting Started

Make sure Node.js is installed on your system.

Place your ROMs inside a folder. Folder names should match the entries in `consoleMap`. Example structure:
```bash
ROMs/
    NES/
        Super Mario Bros. (World).nes
    SNES/
        Chrono Trigger (USA).sfc
    NDS/
        New Super Mario Bros. (Europe) (En,Fr,De,Es,It).nds
    GC/
        Animal Crossing (USA, Canada).rvz
    PSX/
        Final Fantasy VII (USA) (Disc 1).chd
```

### Run with npx

```bash
npx ra-scan ROMs/ -k YOUR_API_KEY
```

### Install with Node.js

Clone the repo
```bash
git clone https://github.com/TheDragonary/RetroAchievements-ROM-Scanner.git
```

Install dependencies
```bash
npm install
```

Run the script
```bash
npm run start -- ROMs/ --api-key YOUR_API_KEY
```

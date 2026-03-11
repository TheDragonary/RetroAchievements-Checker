# RetroAchievements Checker

A tool that scans your ROM library and matches each file with its corresponding RetroAchievements entry using the RetroAchievements API.

It calculates ROM hashes and compares them against the official RetroAchievements hash database to identify which games in your collection support achievements.

## Features
- Scans a ROM library and detects supported RetroAchievements games
- Uses the official RetroAchievements hash database
- Supports compressed and disc formats (CHD, RVZ)
- Automatically detects console from folder name or file extension
- Caches RetroAchievements console and game data
- Caches previously calculated ROM hashes for faster rescans
- Generates lists of supported and unsupported games

## Supported Systems
- NES / Famicom Disk System
- SNES
- Nintendo 64
- Game Boy / Color / Advance
- Nintendo DS / DSi
- Nintendo GameCube
- Nintendo Wii
- Sega Genesis / Mega Drive
- PlayStation
- PlayStation 2
- PlayStation Portable

CHD files are supported natively.

RVZ files are temporarily converted to ISO in order to compute the correct RetroAchievements hash. The temporary ISO file is automatically deleted after hashing. 

## Output
The script will:
- Scan all ROM files inside the ROMs directory
- Detect the console for each ROM
- Calculate the RetroAchievements hash
- Compare the hash against the official database
- Cache API responses locally
- Cache calculated ROM hashes
- Output supported and unsupported games
- Display total supported games

Example output:
```
✅ NES      Super Mario Bros. (World).nes -> Super Mario Bros.
✅ SNES     Chrono Trigger (USA).sfc -> Chrono Trigger
❌ SNES     Super Mario World (Europe).sfc -> Not supported
```

## Getting Started
Clone the repo
```
git clone https://github.com/TheDragonary/RetroAchievements-Checker.git
```

Install dependencies
```
npm install
```

Create a `.env` file in the root directory and add your RetroAchievements API key.
```dotenv
RA_API_KEY=your_api_key
```

Place your ROMs inside a folder. Folder names should match the entries in `consoleMap`. Example structure:
```
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

Run the script and make sure to specify the path to your ROMs folder. Example:
```
node index.ts ./ROMs
```

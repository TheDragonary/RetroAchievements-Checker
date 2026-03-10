# RetroAchievements Checker

A tool that scans your ROM library and matches each file with its corresponding RetroAchievements entry using the RetroAchievements API.

It compares ROM hashes with the official RetroAchievements database to identify supported games.

## Features
- Matches ROM files to RetroAchievements supported games
- Uses official RetroAchievements hash database
- Supports compressed and disc formats (CHD, RVZ)
- Automatically detects system from file extension

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

RVZ files are supported by temporarily converting them to ISO format in order to calculate the correct hash. The temporary file is deleted after processing. 

## Output
The script will:

- Scan all ROM files in the ROMs directory
- Calculate their hashes
- Query the RetroAchievements API
- Report whether each ROM matches a supported game
- Output total supported games

Example output:

✅ NES      Super Mario Bros. (World).nes -> Super Mario Bros.

✅ SNES     Chrono Trigger (USA).sfc -> Chrono Trigger

❌ SNES     Super Mario World (Europe).sfc -> Not supported

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

Place your ROMs inside a `ROMs` directory in the project root. Folder names must match the entries in `consoleMap`. Example:
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

Run the script:
```
node index.ts
```

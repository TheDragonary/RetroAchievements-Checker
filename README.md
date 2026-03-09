# RetroAchievements Checker

This is a tool to match all ROM files with their corresponding RetroAchievements games. It uses the RetroAchievements API to fetch game information and then compares the file hashes with the game hashes stored in the database.

## Supported Systems
- NES
- SNES
- Famicom Disk System
- Game Boy
- Game Boy Color
- Game Boy Advance
- Nintendo 64
- Nintendo DS
- Nintendo DSi
- Nintendo GameCube
- Nintendo Wii
- Sega Genesis / Mega Drive
- PlayStation
- PlayStation 2
- PlayStation Portable

(GameCube/Wii .rvz files will not work)

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

Move your ROMs folder into this directory. The script will scan the folder for ROM files. The script will try its best to match each ROM file extension to a system, but to make things easier, make sure all system subfolder names match exactly with the entries in `consoleMap`.
```
node index.ts
```

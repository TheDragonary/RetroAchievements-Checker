#!/usr/bin/env node

import { Command } from "commander";
import "dolphin-tool";
import envPaths from "env-paths";
import fs from "fs";
import { runScanner } from "./index.js";

const program = new Command();
const paths = envPaths("ra-scan");

program
    .name("ra-scan")
    .description("Scan ROM folders for RetroAchievements compatibility")
    .version("0.1.0")
    .argument("<roms>", "ROM folder to scan")
    .option("-k, --api-key <key>", "RetroAchievements API key")
    .option("-c, --clear-cache", "clear cache before scanning")
    .action(async (roms, options) => {
        if (options.clearCache) {
            console.log("Clearing cache:", paths.cache);

            if (fs.existsSync(paths.cache)) {
                fs.rmSync(paths.cache, { recursive: true, force: true });
            }

            fs.mkdirSync(paths.cache, { recursive: true });
        }

        await runScanner(roms, options.apiKey);
    })
    .showHelpAfterError()
    .parseAsync();

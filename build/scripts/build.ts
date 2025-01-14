/**
 * @author Adam Charron <adam.c@vanillaforums.com>
 * @copyright 2009-2018 Vanilla Forums Inc.
 * @license GPL-2.0-only
 */

import { getOptions, BuildMode } from "./buildOptions";
import { spawnChildProcess } from "./utility/moduleUtils";
import Builder from "./Builder";
import path from "path";
import { DIST_DIRECTORY } from "./env";

/**
 * Run the build. Options are passed as arguments from the command line.
 * @see https://docs.vanillaforums.com/developer/tools/building-frontend/
 */
void getOptions().then(async (options) => {
    const builder = new Builder(options);
    await builder.build();

    if (options.mode === BuildMode.PRODUCTION) {
        const vendorFiles = path.join(DIST_DIRECTORY, "*", "vendors*.js");
        const libFiles = path.join(DIST_DIRECTORY, "*", "library*.js");

        await spawnChildProcess("yarn", ["es-check", "es5", vendorFiles, libFiles], {
            stdio: "inherit",
        }).catch((e) => {
            process.exit(1);
        });
    }
});

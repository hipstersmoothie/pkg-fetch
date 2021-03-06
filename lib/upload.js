import fs from "fs-extra";
import path from "path";

import { hostArch, hostPlatform } from "./system.js";
import { localPlace, remotePlace } from "./places.js";
import { log } from "./log.js";
import { Cloud } from "./cloud.js";
import build from "./build.js";
import patchesJson from "../patches/patches.json";
import { verify } from "./verify.js";
import { version } from "../package.json";

const cloud = new Cloud({ owner: "jesec", repo: "pkg-fetch" });

export async function main() {
  if (!process.env.GITHUB_TOKEN) {
    log.warn("No github credentials. Upload skipped!");
  }

  for (const nodeVersion in patchesJson) {
    const targetArchs = [];

    if (process.env.TARGET_ARCH) {
      targetArchs.push(process.env.TARGET_ARCH);
    } else {
      targetArchs.push(hostArch);
    }

    log.info(`Target architectures: ${targetArchs.join()}`);

    for (const targetArch of targetArchs) {
      const local = localPlace({
        from: "built",
        arch: targetArch,
        nodeVersion,
        platform: hostPlatform,
        version,
      });

      const remote = remotePlace({
        arch: targetArch,
        nodeVersion,
        platform: hostPlatform,
        version,
      });

      const short = path.basename(local);

      log.info(`Building ${short}...`);
      await build(nodeVersion, targetArch, local);

      if (hostArch === targetArch) {
        log.info(`Verifying ${short}...`);
        await verify(local);
      }

      if (process.env.GITHUB_TOKEN) {
        if (await cloud.alreadyUploaded(remote)) continue;

        log.info(`Uploading ${short}...`);

        try {
          await cloud.upload(local, remote);
        } catch (error) {
          // TODO catch only network errors
          if (!error.wasReported) log.error(error);
          log.info("Meanwhile i will continue making binaries");
        }
      } else {
        log.info(`Expected asset name: ${remote.name}`);

        const distFolder = path.join(__dirname, "../dist");

        await fs.mkdirp(distFolder);
        await fs.move(local, path.join(distFolder, remote.name));
      }
    }
  }
}

if (!module.parent) {
  main().catch((error) => {
    if (!error.wasReported) log.error(error);
    process.exit(2);
  });
}

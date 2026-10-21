// electron-builder afterPack hook.
//
// Without a signing certificate electron-builder leaves the macOS app
// unsigned. Packaging changes the bundle, so its original signature no longer
// matches and Apple Silicon reports a downloaded copy as "damaged". An ad-hoc
// signature keeps the bundle valid: macOS then asks the user to allow the app
// once in System Settings > Privacy & Security. With a certificate (CSC_LINK
// or CSC_NAME) electron-builder signs the app itself right after this hook.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

function needsAdHocSignature(platform, env = process.env) {
  return platform === "darwin" && !env.CSC_LINK && !env.CSC_NAME;
}

async function afterPack(context) {
  if (!needsAdHocSignature(context.electronPlatformName)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (process.platform !== "darwin") {
    console.warn(`  • skipped ad-hoc signing  app=${app} (codesign runs only on macOS)`);
    return;
  }
  console.log(`  • ad-hoc signing  app=${app} (no signing certificate)`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.needsAdHocSignature = needsAdHocSignature;

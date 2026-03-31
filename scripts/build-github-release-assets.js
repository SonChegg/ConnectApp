"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const distDir = path.join(rootDir, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const zipFileName = "ConnectApp.win-unpacked.zip";
const manifestFileName = "connectapp-manifest.json";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function ensureExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found: ${targetPath}`);
  }
}

function buildZip(sourceDir, destinationPath) {
  if (fs.existsSync(destinationPath)) {
    fs.rmSync(destinationPath, { force: true });
  }

  if (process.platform === "win32") {
    run(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "Compress-Archive -Path * -DestinationPath $args[0] -Force",
        destinationPath,
      ],
      { cwd: sourceDir },
    );
    return;
  }

  const python = process.env.PYTHON || process.env.PYTHON3 || "python3";

  run(python, [
    "-c",
    [
      "from pathlib import Path",
      "import sys, zipfile",
      "source = Path(sys.argv[1])",
      "destination = Path(sys.argv[2])",
      "with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:",
      "    for item in sorted(source.rglob('*')):",
      "        if item.is_file():",
      "            archive.write(item, item.relative_to(source))",
    ].join("\n"),
    sourceDir,
    destinationPath,
  ]);
}

function sha512(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

function main() {
  ensureExists(packageJsonPath, "package.json");
  ensureExists(unpackedDir, "Windows unpacked build");

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const repository = process.env.CONNECTAPP_RELEASE_REPO || "SonChegg/ConnectApp";
  const baseUrl =
    process.env.CONNECTAPP_RELEASE_BASE_URL ||
    `https://github.com/${repository}/releases/latest/download`;
  const zipPath = path.join(distDir, zipFileName);
  const manifestPath = path.join(distDir, manifestFileName);

  buildZip(unpackedDir, zipPath);

  const stats = fs.statSync(zipPath);
  const manifest = {
    version: packageJson.version,
    url: `${baseUrl}/${zipFileName}`,
    sha512: sha512(zipPath),
    size: stats.size,
    releaseDate: new Date().toISOString(),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Created ${zipPath}`);
  console.log(`Created ${manifestPath}`);
}

main();

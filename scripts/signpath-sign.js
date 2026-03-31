"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for SignPath signing. See README for the required environment variables.`,
    );
  }

  return value;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

exports.default = async function sign(configuration) {
  if (process.platform !== "win32") {
    throw new Error(
      "SignPath signing requires Windows because electron-builder will call signtool.exe with the SignPath KSP.",
    );
  }

  if (!configuration || !configuration.path) {
    throw new Error("electron-builder did not provide a file path to sign.");
  }

  const certificateFile = path.resolve(readRequiredEnv("SIGNPATH_CERT_FILE"));
  const projectSlug = readRequiredEnv("SIGNPATH_PROJECT_SLUG");
  const policySlug = readRequiredEnv("SIGNPATH_POLICY_SLUG");
  const signToolPath = process.env.SIGNTOOL_PATH || "signtool.exe";
  const timestampUrl =
    process.env.SIGNPATH_TIMESTAMP_URL || "http://timestamp.digicert.com";

  if (!fs.existsSync(certificateFile)) {
    throw new Error(`SignPath certificate file not found: ${certificateFile}`);
  }

  await run(signToolPath, [
    "sign",
    "/v",
    "/tr",
    timestampUrl,
    "/td",
    "sha256",
    "/fd",
    "sha256",
    "/csp",
    "SignPathKSP",
    "/kc",
    `${projectSlug}/${policySlug}`,
    "/f",
    certificateFile,
    configuration.path,
  ]);
};

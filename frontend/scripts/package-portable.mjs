import { build } from "esbuild";
import {
  mkdir,
  cp,
  copyFile,
  readFile,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error(
    "Build this distribution on Windows x64 so that the bundled Node runtime matches.",
  );
}
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releases = resolve(project, "..", "releases");
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d+Z$/, "Z");
const name = `Axiom-Windows-x64-${stamp}`;
const output = join(releases, name);
const archive = output + ".zip";
await mkdir(output, { recursive: true });
await mkdir(join(output, "app"));
await mkdir(join(output, "runtime"));
await mkdir(join(output, "licenses"));

await build({
  entryPoints: [join(project, "server/portable.ts")],
  outfile: join(output, "app/server.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  minify: true,
  legalComments: "linked",
});
await cp(join(project, "dist"), join(output, "web"), { recursive: true });
await copyFile(process.execPath, join(output, "runtime/node.exe"));
await copyFile(join(project, ".env.example"), join(output, ".env.example"));
await copyFile(
  join(project, "docs/portable-readme.txt"),
  join(output, "使用说明.txt"),
);
const launcher = `@echo off
setlocal
title Axiom - Math Learning Workbench
cd /d "%~dp0"
"%~dp0runtime\\node.exe" "%~dp0app\\server.cjs"
if errorlevel 1 (
  echo.
  echo Axiom could not start. Read the error above and the included instructions.
  pause
)
`;
await writeFile(
  join(output, "启动 Axiom.cmd"),
  launcher.replaceAll("\n", "\r\n"),
);

// Keep the exact runtime's upstream license, including its bundled libraries.
const licenseURL = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
const licenseCache = join(project, "licenses", `node-${process.version}.txt`);
let nodeLicense;
try { nodeLicense = await readFile(licenseCache, "utf8"); }
catch {
  const response = await fetch(licenseURL, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Cannot obtain Node.js license: HTTP ${response.status}`);
  nodeLicense = await response.text();
}
if (!nodeLicense.includes("Permission is hereby granted"))
  throw new Error("Unexpected Node.js license response");
await writeFile(join(output, "licenses/Node.js-LICENSE.txt"), nodeLicense);

const lock = JSON.parse(
  await readFile(join(project, "package-lock.json"), "utf8"),
);
const dependencies = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const folder = join(project, path);
  const metadata = JSON.parse(
    await readFile(join(folder, "package.json"), "utf8"),
  );
  const licenseFiles = (await readdir(folder)).filter((name) =>
    /^(licen[sc]e|notice|copying|copyright)(\.|$)/i.test(name),
  );
  // This package publishes its author/license notice in the original source.
  if (metadata.name === "javascript-natural-sort" && !licenseFiles.length) {
    licenseFiles.push("naturalSort.js", "package.json", "README.md");
  }
  if (metadata.name === "seedrandom" && !licenseFiles.length) {
    licenseFiles.push("seedrandom.js", "README.md");
  }
  if (!licenseFiles.length)
    throw new Error(`Missing license for ${metadata.name}`);
  const destination = join(
    output,
    "licenses",
    metadata.name.replaceAll("/", "__"),
  );
  await mkdir(destination, { recursive: true });
  for (const file of licenseFiles) {
    if ((await stat(join(folder, file))).isFile())
      await copyFile(join(folder, file), join(destination, file));
  }
  dependencies.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license,
  });
}
await writeFile(
  join(output, "licenses/dependencies.json"),
  JSON.stringify(dependencies, null, 2),
);
const files = [];
async function inventory(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await inventory(path);
    else
      files.push({
        path: relative(output, path).replaceAll("\\", "/"),
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
  }
}
await inventory(output);
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(
    {
      application: "Axiom",
      packagedAt: new Date().toISOString(),
      platform: "win32-x64",
      node: process.version,
      nodeLicense: licenseURL,
      files,
    },
    null,
    2,
  ),
);
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem\n[System.IO.Compression.ZipFile]::CreateFromDirectory($env:AXIOM_PACKAGE_DIR, $env:AXIOM_PACKAGE_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)",
  ],
  {
    env: {
      ...process.env,
      AXIOM_PACKAGE_DIR: output,
      AXIOM_PACKAGE_ZIP: archive,
    },
    windowsHide: true,
    stdio: "inherit",
  },
);
console.log(
  JSON.stringify({
    archive,
    folder: output,
    bytes: (await stat(archive)).size,
    node: process.version,
  }),
);

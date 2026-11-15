import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  stat,
  copyFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("Windows x64 build host required");
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(frontend, "..");
const cache = join(project, ".portable-cache");
const runtime = join(cache, "python-3.12.7");
const zip = join(cache, "python-3.12.7-embed-amd64.zip");
const powershell = (script, env = {}) =>
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'\n" + script,
    ],
    { env: { ...process.env, ...env }, windowsHide: true, stdio: "inherit" },
  );
await mkdir(cache, { recursive: true });
if (!existsSync(zip))
  powershell(
    "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip' -OutFile $env:AXIOM_RUNTIME_ZIP",
    { AXIOM_RUNTIME_ZIP: zip },
  );
if (!existsSync(join(runtime, "python.exe")))
  powershell(
    "Add-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::ExtractToDirectory($env:AXIOM_RUNTIME_ZIP, $env:AXIOM_RUNTIME_DIR)",
    { AXIOM_RUNTIME_ZIP: zip, AXIOM_RUNTIME_DIR: runtime },
  );

const requirementsFile = join(project, "backend", "requirements.txt");
const requirementsHash = createHash("sha256")
  .update(await readFile(requirementsFile))
  .digest("hex");
const dependencyMarker = join(
  runtime,
  "site-packages",
  ".axiom-dependencies.sha256",
);
const installedHash = existsSync(dependencyMarker)
  ? (await readFile(dependencyMarker, "utf8")).trim()
  : "";
if (
  !existsSync(join(runtime, "site-packages", "flask")) ||
  !existsSync(join(runtime, "site-packages", "cryptography")) ||
  installedHash !== requirementsHash
) {
  execFileSync(
    "python",
    [
      "-m",
      "pip",
      "install",
      "--target",
      join(runtime, "site-packages"),
      "--only-binary=:all:",
      "--no-compile",
      "-r",
      requirementsFile,
      "tzdata",
      "--report",
      join(cache, "python-dependencies.json"),
    ],
    { windowsHide: true, stdio: "inherit" },
  );
  await writeFile(
    dependencyMarker,
    requirementsHash + "\n",
    "utf8",
  );
}

const name = `Axiom-Windows-Full-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d+Z$/, "Z")}`;
const output = join(project, "releases", name);
await mkdir(output, { recursive: true });
const filter = (path) =>
  !path
    .split(/[\\/]/)
    .some((part) => part === "__pycache__" || part === "bin") &&
  !path.endsWith(".pyc");
await cp(runtime, join(output, "runtime"), { recursive: true, filter });
await writeFile(
  join(output, "runtime", "python312._pth"),
  "python312.zip\n.\nsite-packages\n../backend\nimport site\n",
);
await mkdir(join(output, "backend"));
for (const folder of ["app", "migrations"])
  await cp(join(project, "backend", folder), join(output, "backend", folder), {
    recursive: true,
    filter,
  });
await copyFile(
  join(project, "backend", "portable_server.py"),
  join(output, "backend", "portable_server.py"),
);
await cp(join(frontend, "dist-portable"), join(output, "web"), {
  recursive: true,
  filter: (path) => !path.endsWith(".gz") && !path.endsWith(".br"),
});
await copyFile(
  join(frontend, "docs", "portable-full-readme.txt"),
  join(output, "使用说明.txt"),
);
await writeFile(
  join(output, "backend", ".env.example"),
  `# Copy to .env in this backend folder, then restart.
AXIOM_PORT=5186
AXIOM_AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=
AI_JSON_MODE=true
AXIOM_LEGACY_AI=true
`,
);
await writeFile(
  join(output, "启动 Axiom.cmd"),
  `@echo off\r\nsetlocal\r\ntitle Axiom - Math Learning Workbench\r\ncd /d "%~dp0"\r\nset "PYTHONDONTWRITEBYTECODE=1"\r\n"%~dp0runtime\\python.exe" -B "%~dp0backend\\portable_server.py"\r\nif errorlevel 1 (\r\n  echo Axiom could not start. Please read the error above.\r\n  pause\r\n)\r\n`,
);
await mkdir(join(output, "licenses"));
await copyFile(
  join(runtime, "LICENSE.txt"),
  join(output, "licenses", "Python-LICENSE.txt"),
);
const lock = JSON.parse(
  await readFile(join(frontend, "package-lock.json"), "utf8"),
);
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.optional) continue;
  const folder = join(frontend, path);
  if (!existsSync(join(folder, "package.json"))) {
    if (info.optional) continue;
    throw new Error(`Missing package metadata: ${path}`);
  }
  const metadata = JSON.parse(await readFile(join(folder, "package.json"), "utf8"));
  const files = (await readdir(folder)).filter((n) =>
    /^(licen[sc]e|notice|copying|copyright)(\.|$)/i.test(n),
  );
  if (metadata.name === "javascript-natural-sort" && !files.length)
    files.push("naturalSort.js", "package.json", "README.md");
  if (metadata.name === "seedrandom" && !files.length)
    files.push("seedrandom.js", "README.md");
  if (!files.length) {
    // Some small transitive packages only declare a license in package.json.
    // Include that declaration and the README; these files are not runtime code.
    files.push("package.json");
    const readme = (await readdir(folder)).find((name) =>
      /^readme(\.|$)/i.test(name),
    );
    if (readme) files.push(readme);
  }
  const destination = join(
    output,
    "licenses",
    metadata.name.replaceAll("/", "__"),
  );
  await mkdir(destination, { recursive: true });
  for (const file of files)
    if ((await stat(join(folder, file))).isFile())
      await copyFile(join(folder, file), join(destination, file));
}
const dependencies = JSON.parse(
  await readFile(join(cache, "python-dependencies.json"), "utf8"),
).install.map((x) => ({
  name: x.metadata.name,
  version: x.metadata.version,
  sha256: x.download_info.archive_info.hashes.sha256,
}));
await writeFile(
  join(output, "licenses", "python-dependencies.json"),
  JSON.stringify(dependencies, null, 2),
);
const files = [];
async function inventory(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) await inventory(path);
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
      application: "Axiom full portable",
      platform: "Windows x64",
      python: "3.12.7",
      packagedAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ),
);
const archive = output + ".zip";
powershell(
  "Add-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($env:AXIOM_PACKAGE_DIR, $env:AXIOM_PACKAGE_ZIP, [IO.Compression.CompressionLevel]::Optimal, $true)",
  { AXIOM_PACKAGE_DIR: output, AXIOM_PACKAGE_ZIP: archive },
);
console.log(
  JSON.stringify({
    archive,
    folder: output,
    bytes: (await stat(archive)).size,
    files: files.length,
  }),
);

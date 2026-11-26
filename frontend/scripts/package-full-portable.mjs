import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  stat,
  copyFile,
  mkdtemp,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("Windows x64 build host required");
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(frontend, "..");
const prepared = JSON.parse(
  execFileSync("python", [join(frontend, "scripts", "portable_python.py")], {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const { runtime, dependencies } = prepared;
const pdf = dependencies.find(({ name }) => name === "pypdf");
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
const name = `Axiom-Windows-Full-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d+Z$/, "Z")}`;
const releases = join(project, "releases");
await mkdir(releases, { recursive: true });
const stage = await mkdtemp(join(releases, ".build-"));
const output = join(stage, name);
const finalFolder = join(releases, name);
try {
  await mkdir(output);
  const filter = (path) =>
    !path
      .split(/[\\/]/)
      .some((part) => part === "__pycache__" || part === "bin") &&
    !path.endsWith(".pyc");
  await cp(runtime, join(output, "runtime"), { recursive: true });
  await mkdir(join(output, "backend"));
  for (const folder of ["app", "migrations"])
    await cp(
      join(project, "backend", folder),
      join(output, "backend", folder),
      {
        recursive: true,
        filter,
      },
    );
  await copyFile(
    join(project, "backend", "portable_server.py"),
    join(output, "backend", "portable_server.py"),
  );
  execFileSync(
    join(output, "runtime", "python.exe"),
    [
      "-s",
      "-B",
      "-c",
      [
        "import sys, pathlib, pypdf, flask, sqlalchemy, numpy",
        "from app.api import local_workstation",
        "root = pathlib.Path(sys.executable).resolve().parent",
        "assert all(pathlib.Path(m.__file__).resolve().is_relative_to(root / 'site-packages') for m in (pypdf, flask, sqlalchemy, numpy))",
        "assert pathlib.Path(local_workstation.__file__).resolve().is_relative_to(root.parent / 'backend')",
        "assert pypdf.__version__ == sys.argv[1]",
      ].join("\n"),
      pdf.version,
    ],
    { windowsHide: true, stdio: "inherit" },
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
    `@echo off\r\nsetlocal\r\ntitle Axiom - Math Learning Workbench\r\ncd /d "%~dp0"\r\nset "PYTHONDONTWRITEBYTECODE=1"\r\n"%~dp0runtime\\python.exe" -s -B "%~dp0backend\\portable_server.py"\r\nif errorlevel 1 (\r\n  echo Axiom could not start. Please read the error above.\r\n  pause\r\n)\r\n`,
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
    if (!path || info.dev) continue;
    const folder = join(frontend, path),
      metadata = JSON.parse(
        await readFile(join(folder, "package.json"), "utf8"),
      );
    const files = (await readdir(folder)).filter((n) =>
      /^(licen[sc]e|notice|copying|copyright)([._-]|$)/i.test(n),
    );
    if (metadata.name === "javascript-natural-sort" && !files.length)
      files.push("naturalSort.js", "package.json", "README.md");
    if (metadata.name === "seedrandom" && !files.length)
      files.push("seedrandom.js", "README.md");
    if (!files.length) throw new Error(`Missing license: ${metadata.name}`);
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
  await copyFile(
    join(runtime, "site-packages", pdf.licenses[0]),
    join(output, "licenses", "pypdf-LICENSE.txt"),
  );
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
        python: prepared.python,
        pythonDistribution: {
          embedSha256: prepared.embed_sha256,
          runtimeSha256: prepared.runtime_sha256,
          requirementsSha256: prepared.requirements_sha256,
          report: "licenses/python-dependencies.json",
          pdfWheel: pdf.wheel,
          pdfWheelSha256: pdf.sha256,
          pdfLicense: "licenses/pypdf-LICENSE.txt",
        },
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
  await rename(output, finalFolder);
  await rename(archive, finalFolder + ".zip");
  console.log(
    JSON.stringify({
      archive: finalFolder + ".zip",
      folder: finalFolder,
      bytes: (await stat(finalFolder + ".zip")).size,
      files: files.length,
    }),
  );
} finally {
  if (dirname(resolve(stage)) === resolve(releases))
    await rm(stage, { recursive: true, force: true });
}

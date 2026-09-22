import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'gcode-seer-package-'));
let tarball: string | undefined;
try {
  const output = execFileSync('npm', ['pack', '--ignore-scripts', '--json'], {
    encoding: 'utf8',
  });
  const packages = JSON.parse(output) as {
    filename: string;
    files: { path: string }[];
  }[];
  const packed = packages[0];
  if (!packed) throw new Error('npm pack returned no package.');
  tarball = resolve(packed.filename);
  if (
    packed.files.some((file) =>
      /^(test|node_modules|coverage)\//.test(file.path),
    )
  )
    throw new Error('Development files leaked into the package.');
  writeFileSync(
    join(directory, 'package.json'),
    '{"private":true,"type":"module"}',
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    { cwd: directory, stdio: 'pipe' },
  );
  writeFileSync(
    join(directory, 'smoke.mjs'),
    `import { analyze } from 'gcode-seer';\nconst report = analyze('G1 X3 Y4 F600', { initialPosition: { x: 0, y: 0, z: 0 } });\nif (report.distance.total !== 5 || report.maxAxisSpeed.x !== 6) throw new Error('Package import failed');\n`,
  );
  execFileSync(process.execPath, ['smoke.mjs'], {
    cwd: directory,
    stdio: 'inherit',
  });
  writeFileSync(
    join(directory, 'consumer.ts'),
    `import { analyze, type AnalysisReport, type PrinterProfile } from 'gcode-seer';\nconst printer: PrinterProfile = { name: 'consumer' };\nconst report: AnalysisReport = analyze('G21', { printer });\nconsole.log(report.complete);\n`,
  );
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      join(directory, 'consumer.ts'),
    ],
    { cwd: directory, stdio: 'inherit' },
  );
  const metadata = JSON.parse(
    readFileSync(
      join(directory, 'node_modules/gcode-seer/package.json'),
      'utf8',
    ),
  ) as { dependencies?: object };
  if (Object.keys(metadata.dependencies ?? {}).length)
    throw new Error('Expected a dependency-free runtime package.');
  console.log(
    `Package smoke test passed: ${packed.files.length} files, runtime import and TypeScript consumer.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
  if (tarball) rmSync(tarball, { force: true });
}

// Starts the Python research service (FastAPI, research/src/cse_xai/service.py) from research/.venv.
// Used by `npm run start:research` and by the `research:serve` Nx target (so `npm start` runs it too).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const researchDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'research');
const python =
  process.platform === 'win32'
    ? join(researchDir, '.venv', 'Scripts', 'python.exe')
    : join(researchDir, '.venv', 'bin', 'python');
const port = process.env.RESEARCH_SERVICE_PORT ?? '8001';

if (!existsSync(python)) {
  console.error(`Research venv not found (${python}). Set it up once:

  cd research
  python -m venv .venv
  .venv/Scripts/python -m pip install -e ".[dev,service]"      (macOS/Linux: .venv/bin/python)
  .venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
`);
  process.exit(1);
}

// No --reload: a reload would kill a running sync/rebuild job. Restart manually after Python changes.
const child = spawn(python, ['-m', 'uvicorn', 'cse_xai.service:app', '--host', '127.0.0.1', '--port', port], {
  cwd: researchDir,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

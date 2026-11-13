import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node tools/run-without-node-options.mjs <command> [args...]');
  process.exit(1);
}

const env = { ...process.env };
delete env.NODE_OPTIONS;
delete env.NODE_INSPECT_RESUME_ON_START;

const child = spawn(command, args, {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

'use strict';
// Windows' bash alias can point to an uninstalled WSL distribution. Use the
// existing Git Bash installation there; other hosts use their ordinary Bash.
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
let bash = 'bash';
if (process.platform === 'win32') {
  const candidates = [process.env.ProgramFiles,process.env['ProgramFiles(x86)']]
    .filter(Boolean).map(directory => join(directory,'Git','bin','bash.exe'));
  if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA,'Programs','Git','bin','bash.exe'));
  bash = candidates.find(existsSync) || bash;
}
const result = spawnSync(bash,['scripts/test-all.sh'],{ cwd:resolve(__dirname,'..'),stdio:'inherit' });
if (result.error) console.error('Bash test runner could not start:',result.error.code);
process.exit(result.status ?? 1);

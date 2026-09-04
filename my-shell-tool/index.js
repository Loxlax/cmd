
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const chalk = require('chalk');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'mysh> '
});

console.log(chalk.blue.bold('=== Ratcahnon handsomeandcool shall ==='));
console.log(chalk.gray('Type "help" for commands, "exit" to quit.'));

// Built-in cmdlets
const builtins = {
  'get-childitem': async (args, input) => {
    const target = args[0] || '.';
    const listPath = path.resolve(process.cwd(), target);
    try {
      const names = fs.readdirSync(listPath, { withFileTypes: true });
      return names.map(dirent => {
        const full = path.join(listPath, dirent.name);
        const stat = fs.existsSync(full) ? fs.statSync(full) : null;
        return {
          Name: dirent.name,
          FullName: full,
          IsDirectory: dirent.isDirectory(),
          Size: stat ? stat.size : 0,
          Mode: stat ? stat.mode : null
        };
      });
    } catch (e) {
      return [{ error: String(e) }];
    }
  },
  'ls': async (args, input) => builtins['get-childitem'](args, input),

  'get-content': async (args, input) => {
    const target = args[0];
    if (!target) return [{ error: 'No file specified' }];
    try {
      const content = fs.readFileSync(path.resolve(process.cwd(), target), 'utf8');
      return content.split(/\r?\n/).map((line, idx) => ({ Line: line, Index: idx }));
    } catch (e) {
      return [{ error: String(e) }];
    }
  },
  'cat': async (args, input) => builtins['get-content'](args, input),

  'create': async (args, input) => {
    const target = args[0];
    if (!target) return [{ error: 'No file specified' }];
    try {
      fs.writeFileSync(path.resolve(process.cwd(), target), input && Array.isArray(input) ? JSON.stringify(input, null, 2) : '');
      return [{ result: `Created ${target}` }];
    } catch (e) {
      return [{ error: String(e) }];
    }
  },

  'read': async (args, input) => {
    const target = args[0];
    if (!target) return [{ error: 'No file specified' }];
    try {
      const content = fs.readFileSync(path.resolve(process.cwd(), target), 'utf8');
      return [{ content }];
    } catch (e) {
      return [{ error: String(e) }];
    }
  },

  'help': async (args, input) => {
    return [
      { cmd: 'get-childitem, ls <path>   - list directory (returns objects)' },
      { cmd: 'get-content, cat <file>   - read file (returns lines as objects)' },
      { cmd: 'create <file>              - create file (writes JSON of input if piped)' },
      { cmd: 'read <file>                - read file (returns content)' },
      { cmd: 'You can pipe builtins: get-childitem | where (not implemented) | select (not implemented)' }
    ];
  }
};

function splitPipeline(line) {
  // very simple split on |; does not handle quoted pipes
  return line.split('|').map(part => part.trim()).filter(Boolean);
}

function splitArgs(cmd) {
  // naive split on spaces (does not handle quotes)
  const parts = cmd.trim().split(/\s+/);
  return parts.filter(Boolean);
}

async function runCommandSegment(segment, input) {
  const parts = splitArgs(segment);
  if (parts.length === 0) return input;
  const name = parts[0];
  const args = parts.slice(1);

  if (builtins[name]) {
    return await builtins[name](args, input);
  }

  // External command: pass input as JSON on stdin when present
  try {
    const spawnOpts = { encoding: 'utf8' };
    let stdinData = null;
    if (input !== undefined) {
      try {
        stdinData = JSON.stringify(input);
      } catch (e) {
        stdinData = String(input);
      }
    }
    const res = spawnSync(name, args, { input: stdinData, ...spawnOpts });
    if (res.error) {
      return [{ error: String(res.error) }];
    }
    const stdout = (res.stdout || '').toString();
    // Try parse JSON
    try {
      const parsed = JSON.parse(stdout);
      return parsed;
    } catch (_) {
      return [{ text: stdout }];
    }
  } catch (e) {
    return [{ error: String(e) }];
  }
}

async function runPipeline(line) {
  const segments = splitPipeline(line);
  let data = undefined;
  for (const seg of segments) {
    data = await runCommandSegment(seg, data);
  }
  return data;
}

function prettyPrint(result) {
  if (result === undefined) return;
  try {
    if (Array.isArray(result)) {
      // print each object as JSON on its own line for readability
      result.forEach(item => console.log(JSON.stringify(item, null, 2)));
    } else if (typeof result === 'object') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(String(result));
    }
  } catch (e) {
    console.log(String(result));
  }
}

rl.prompt();
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }
  if (trimmed === 'exit' || trimmed === 'quit') { rl.close(); return; }

  try {
    const result = await runPipeline(trimmed);
    prettyPrint(result);
  } catch (e) {
    console.error(chalk.red('Error:'), e);
  }

  rl.prompt();
}).on('close', () => {
  console.log(chalk.green('\nGoodbye.'));
  process.exit(0);
});

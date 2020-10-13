#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import commander from 'commander';
import TNL from '../index.js';

process.env.TNL_USAGE = 'CLI';

const pkg = JSON.parse(fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json')));

const program = commander.program;

program
  .version(pkg.version)
  .name('tnl')
  .description('TOR Network Launcher')
  .option('-s --silent', 'hide all messages from all netowrks', false)
  .option('-i --instances <number>', 'launch [number] networks', 1)
  /*
  // TODO:
  .option('-o --output <path>', 'specify log file for stdout')
  .option('-e --error <path>', 'specify log file for stderr')
  .option('-l --log [path]', 'specify log file which gathers both stdout and stderr')
  .option('--log-type <type>', 'specify log output style (raw by default, json optional)')
  .option('--merge-logs', 'merge logs from different instances but keep error and out separated')
  */
  .option('-p --pid <pid>', 'specify pid file')
  .usage('[options]');

program.parse(process.argv);

const cliOpts = program.options.map(opt => opt.long.slice(2)).reduce((acc, v) => {
  acc[v] = program[v];
  return acc;
}, {});

const tnl = new TNL({ silent: program.silent }, cliOpts);

tnl.launch(program.instances);

import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Debug from 'debug';

const pkg = JSON.parse(fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json')).toString());

export default Debug(pkg.name);

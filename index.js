import os from 'os';
import fs from 'fs';
import EventEmitter from 'events';
import { spawn } from 'child_process';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import portscanner from 'portscanner';
import rimraf from 'rimraf';
import debug from './lib/debugger.js';

process.on('SIGINT', onSigintSigterm);
process.on('SIGTERM', onSigintSigterm);
process.on('exit', onProcessExit);

const basePath = join(dirname(fileURLToPath(import.meta.url)), 'temp');
const defaultProps = {
  silent: false,
};

let pidFiles = new Map();
let output;

export default class TORNetworks extends EventEmitter{
  #cliOpts = {};
	#internalIp = '127.0.0.1';
	#externalIp = getExtIp();
	#networksProcesses = new Map();
	#list = [];
	constructor(props, cliOpts) {
		super();
		const { silent } = {...defaultProps, ...props};
    debug('Internal IP: %s', this.#internalIp);
    debug('External IP: %s', this.#externalIp);
    this.silent = !!silent;
    this.silent && debug('Silent mode');
    if (process.env.TNL_USAGE === 'CLI') {
      this.#cliOpts = cliOpts;
    }
  }
	get list() {
		return this.#list;
	}
	async launch(networksCount = 1) {
	  const networksCountToNum = Number(networksCount);
		if (Number.isNaN(networksCountToNum) || 'boolean' === typeof networksCount || networksCountToNum <= 0) {
		  const instances = process.env.TNL_USAGE === 'CLI' ? '--instances' : 'Instances';
      const err = new Error(`${instances} must be an positive number. Received ${networksCount}`);
      if (process.env.TNL_USAGE === 'CLI') {
        throw err;
      } else {
        return this.emit('error', err);
      }
		}

		for (let i = 0; i < networksCount; i++) {
			this.#launchNetwork();
		}
	}
	#portAvailable(port) {
		return new Promise(resolve => {
			portscanner.checkPortStatus(port, this.#internalIp, (err, status) => {
				if (err) return resolve(false);
				resolve(status === 'closed');
			});
		});
	}
	async #launchNetwork(socksPortAny, controlPortAny) {
		if (!socksPortAny || !controlPortAny) {
			socksPortAny = socksPortAny || randomPort();
			controlPortAny = controlPortAny || randomPort();

			while (true) {
				const socksPortAvailable = await this.#portAvailable(socksPortAny);
				const controlPortAvailable = await this.#portAvailable(controlPortAny);

				if (!socksPortAvailable || !controlPortAvailable || socksPortAny === controlPortAny) {
					socksPortAny = socksPortAny || randomPort();
					controlPortAny = controlPortAny || randomPort();
					continue;
				}

				break;
			}
		}

		const socksPort = Number(socksPortAny),
			controlPort = Number(controlPortAny);
		const network = {
			internal: `socks5://${this.#internalIp}:${socksPort}`,
			external: `socks5://${this.#externalIp}:${socksPort}`,
		};
		const torRCfile = basePath + '/torrc.' + socksPort;
		const text = 'SocksPort ' + socksPort + '\n' +
			'ControlPort ' + controlPort + '\n' +
			'DataDirectory ' + basePath + '/tor' + socksPort;
		fs.writeFileSync(torRCfile, text);
		const networkProcess = spawn('tor', ['-f', torRCfile], { // TODO: password
			detached: false,
		});

    if (process.env.TNL_USAGE === 'CLI' && this.#cliOpts.pid) {
      let pidPath = this.#cliOpts.pid;
      if (Number(this.#cliOpts.instances) > 1) {
        const extName = extname(pidPath);
        if (extName) {
          pidPath = pidPath.replace(new RegExp(extName + '$'), `.${socksPort}${extName}`)
        } else {
          pidPath += socksPort;
        }
      }
      writePidFile(networkProcess.pid, pidPath);
      pidFiles.set(networkProcess.pid.toString(), pidPath);
    }

		this.#networksProcesses.set(socksPort, networkProcess);

		networkProcess.stdout.on('data', data => {
		  if (!this.silent) {
		    console.log(`${this.#internalIp}:${socksPort}`, data.toString());
      }
			if (data.toString().toLowerCase().includes('bootstrapped 100%')) {
				this.#list.push(network);
				this.emit('network', network);
        debug('Network launched: %o', network);
        if (process.env.TNL_USAGE === 'CLI') {
          if (this.#cliOpts.output) {
            output = this.#cliOpts.output;
            addToOutput(network);
          }
          if (!this.silent) {
            console.log(`Network launched: ${JSON.stringify(network)}`);
          }
        }
			}
		});
		networkProcess.stderr.on('data', data => {
      if (!this.silent) {
        console.error(`${this.#internalIp}:${socksPort}`, data.toString());
      }
			this.emit('networkError', network, data.toString());
      debug(`Network %o error: %s`, network, data.toString());
		});
		networkProcess.on('exit', code => {
			this.#networksProcesses.delete(socksPort);
			this.#list = this.#list.filter(inEx => inEx.internal !== network.internalAddress);
			this.emit('networkExit', network, code.toString());
      if (process.env.TNL_USAGE === 'CLI') {
        if (this.#cliOpts.pid) removePidFile(pidFiles.get(networkProcess.toString()));
        removeFromOutput(network);
      }
      debug(`Closing network: %o. Child process exited with code %s.`, network, code);
		});

		return network;
	}
	async launchNetwork(socksPortAny, controlPortAny) {
		return this.#launchNetwork(socksPortAny, controlPortAny);
	}
	#closeNetwork(network) {
    const internalAddress = network.internal || network;
    const matched = internalAddress.match(/[0-9]{1,5}$/);
    if (!matched) return;
    const socksPort = Number(matched[0]);
    const networkProcess = this.#networksProcesses.get(socksPort);
    if (networkProcess) networkProcess.kill(); // will emit 'exit' on child process
  }
	closeNetwork(network) {
    return this.#closeNetwork(network);
  }
}

function addToOutput(network) {
  fs.appendFileSync(output, JSON.stringify(network) + '\n');
}

function removeFromOutput(network) {
  const search = JSON.stringify(network) + '\n';
  if (!fs.existsSync(output)) return;
  fs.writeFileSync(output, fs.readFileSync(output).toString().replace(search, ''));
}

function writePidFile(pid, filePath) {
  fs.appendFileSync(filePath, pid.toString());
  pidFiles.set(pid.toString(), filePath);
}

function removePidFile(filePath) {
  if (filePath) {
    rimraf.sync(filePath);
  } else {
    Array.from(pidFiles.values()).forEach(filePath => {
      rimraf.sync(filePath);
    });
  }
}

function onSigintSigterm() {
	process.exit(0);
}

function onProcessExit() {
  rimraf.sync(basePath + '/tor*'); // Remove TOR data
  if (process.env.TNL_USAGE === 'CLI') {
    removePidFile();
    rimraf.sync(output);
  }
}

function randomPort(min, max) {
	min = Number(min) || 1;
	max = Number(max) || 65535;
	if (min < 1) min = 1;
	if (max > 65535) max = 65535;
	return Math.floor(
		Math.random() * (max - min + 1) + min
	);
}

function getExtIp() {
	const ifaces = os.networkInterfaces();

	let ip = undefined;

	Object.keys(ifaces).forEach(ifname => {
		let alias = 0;
		ifaces[ifname].forEach(iface => {
			if ('IPv4' !== iface.family || iface.internal !== false) {
				// skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
				return;
			}
			if (alias >= 1) {
				// this single interface has multiple ipv4 addresses
				ip = iface.address;
			} else {
				// this interface has only one ipv4 adress
				ip = iface.address;
			}
		});
	});

	return ip;
}

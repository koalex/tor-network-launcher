# TOR Network Launcher

First you need to install TOR Network:
```sh
# MAC OS example
brew update && brew install tor
```

#### Installing TNL
```sh
npm i tor-network-launcher -g
```

#### Usage
*CLI*:

type `tnl --help` to see all options
```sh
tnl --instances 3 --silent --output /temp/torNetworks.txt
```

*Code*:
```javascript
import TNS from 'tor-network-launcher';

const TORNetworks = new TNS({ silent: true }); // default is false

TORNetworks.on('network', network => {
  console.info(network); // {internal: 'socks5://127.0.0.1:30400', external: 'socks5://192.168.0.77:30400'}
  console.info(TORNetworks.list); // [{internal: 'socks5://127.0.0.1:30400', external: 'socks5://192.168.0.77:30400'}, ...]
  TORNetworks.closeNetwork(network);
});

TORNetworks.on('networkError', (network, message) => {
  console.error(message); // data from sdterr of TOR process
  TORNetworks.closeNetwork(network);
});

TORNetworks.on('networkExit', (network, code) => {
  console.info(`Closing network ${network.internal}. Child process exited with code ${code}.`);
});

TORNetworks.on('error', console.error);

TORNetworks.launch(3); // Launch 3 networks. Default is 1.
```

This project using [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/koalex/tor-network-launcher/tags). 

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

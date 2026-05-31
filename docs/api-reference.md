# Boltwall Suite API Reference

Start here when you need symbol-level documentation for the public TypeScript
packages. The package READMEs are still the best place for setup and quick
starts; this generated reference is for constructor options, config fields,
return shapes, and framework helper details.

## Choose An Entry Point

- <a href="modules/_boltwall_l402.html">@boltwall/l402</a>:
  parse, mint, inspect, and verify L402 credentials. Start with
  <a href="classes/_boltwall_l402.L402.html">L402</a>
  for challenge and credential flows, and
  <a href="classes/_boltwall_l402.Caveat.html">Caveat</a>
  for attenuation.
- <a href="modules/_boltwall_middleware.html">@boltwall/middleware</a>:
  protect HTTP endpoints with the Web Fetch core. Start with
  <a href="functions/_boltwall_middleware.index.authorizeL402.html">authorizeL402</a>
  for framework-neutral authorization.
- <a href="modules/_boltwall_middleware.express.html">@boltwall/middleware/express</a>:
  use
  <a href="functions/_boltwall_middleware.express.boltwall.html">boltwall</a>
  to mount the Express middleware.
- <a href="modules/_boltwall_proxy.html">@boltwall/proxy</a>:
  put an L402 reverse proxy in front of an existing API. Start with
  <a href="functions/_boltwall_proxy.createProxy.html">createProxy</a>
  and
  <a href="interfaces/_boltwall_proxy.ProxyConfig.html">ProxyConfig</a>.
- <a href="modules/_boltwall_adapters.html">@boltwall/adapters</a>:
  connect middleware or proxy deployments to Lightning payment backends. Start
  with
  <a href="classes/_boltwall_adapters.lnd.LndAdapter.html">LndAdapter</a>,
  <a href="classes/_boltwall_adapters.opennode.OpenNodeAdapter.html">OpenNodeAdapter</a>,
  or
  <a href="classes/_boltwall_adapters.btcpay.BtcPayAdapter.html">BtcPayAdapter</a>.

## Common Paths

- Building protocol tooling: use `@boltwall/l402` for `WWW-Authenticate` and
  `Authorization` parsing, macaroon minting, caveat helpers, BOLT 11 invoice
  decoding, and browser-safe verification utilities.
- Protecting an application route: pair `@boltwall/middleware` with one of the
  adapter classes, then configure price, invoice verification, caveat policy,
  and credential handling through the middleware options.
- Deploying a proxy: configure `@boltwall/proxy` with route pricing, backend
  environment loading, CORS exposure for `WWW-Authenticate`, and header
  forwarding rules.

For installation commands, runnable examples, and package-level orientation,
use the repository README and the package README next to each public package.

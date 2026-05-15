# OpenNode Development Environment

OpenNode keeps separate development and production environments. Development
keys are valid for `https://dev-api.opennode.com`; production keys are valid for
`https://api.opennode.com`.

Use development credentials for skipped-by-default provider tests and local
smoke checks:

```sh
OPENNODE_API_KEY=<development-key> \
OPENNODE_BASE_URL=https://dev-api.opennode.com \
bun test packages/adapters/test/opennode.test.ts
```

The default adapter base URL is production. Set `OPENNODE_BASE_URL` explicitly
whenever you are using development-mode keys.

Official references:

- Development environments: <https://developers.opennode.com/docs/environments>
- Authentication: <https://developers.opennode.com/docs/authorization>
- Create charge: <https://developers.opennode.com/reference/create-charge>
- Charge info: <https://developers.opennode.com/reference/charge-info>

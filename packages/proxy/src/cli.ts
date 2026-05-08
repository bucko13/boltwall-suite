#!/usr/bin/env node

const usage = `boltwall <command>

Commands:
  dev       Start the local proxy runtime (stub)
  validate  Validate proxy configuration (stub)
`;

const command = process.argv[2];

switch (command) {
  case "dev":
    console.log("boltwall dev: not implemented yet");
    break;
  case "validate":
    console.log("boltwall validate: not implemented yet");
    break;
  default:
    console.log(usage);
    process.exitCode = command ? 1 : 0;
}

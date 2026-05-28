import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
    if (!relativePath.endsWith(".js") || relativePath.includes("..")) {
      response.writeHead(404).end();
      return;
    }
    let body: Uint8Array;
    try {
      body = await readFile(join(process.cwd(), "dist", relativePath));
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-type": "text/javascript; charset=utf-8",
    });
    response.end(body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("unexpected-server-address");
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("imports MockAdapter from the built testing subpath in Chromium", async ({ page }) => {
  await page.setContent(`
    <script type="module">
      import { MockAdapter } from "${baseUrl}/testing/index.js";

      const adapter = new MockAdapter();
      const invoice = await adapter.createInvoice({ amountMsat: 1234n });
      adapter.settle(invoice.paymentHash);
      const lookup = await adapter.lookupInvoice(invoice.paymentHash);

      globalThis.__mockAdapterResult = {
        kind: adapter.kind,
        hodl: adapter.capabilities.hodl,
        amount: invoice.amountMsat.toString(),
        paymentRequestIncludesHash: invoice.paymentRequest.includes(invoice.paymentHash),
        status: lookup.status,
      };
    </script>
  `);

  const result = await page
    .waitForFunction(() => globalThis.__mockAdapterResult)
    .then((handle) => handle.jsonValue());

  expect(result).toEqual({
    kind: "mock",
    hodl: true,
    amount: "1234",
    paymentRequestIncludesHash: true,
    status: "settled",
  });
});

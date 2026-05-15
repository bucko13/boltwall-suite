import { expect, test } from "@playwright/test";

import {
  PaymentConfigError,
  createProductionPokedexPaymentRuntime,
} from "../../lib/server/payment-config";

test.describe("paid Pokedex API", () => {
  test("missing Authorization returns a dual LSAT/L402 challenge", async ({ request }) => {
    const response = await request.get("/api/pokemon/1");

    expect(response.status()).toBe(402);
    const challenge = requireAuthenticateChallenge(response.headers());
    expect(challenge).toContain("LSAT");
    expect(challenge).toContain("L402");
    expect(challenge.indexOf("LSAT")).toBeLessThan(challenge.indexOf("L402"));
    expect(challenge).toContain('macaroon="');
    expect(challenge).toContain('invoice="lnbcrt');
  });

  test("settled mock credential returns the Pokedex response", async ({ request }) => {
    const challengeResponse = await request.get("/api/pokemon/1");
    const challenge = requireAuthenticateChallenge(challengeResponse.headers());

    const payment = await request.post("/api/pokemon/1", {
      data: { challenge },
    });
    expect(payment.status()).toBe(200);
    const { authorization } = (await payment.json()) as { authorization: string };

    const paid = await request.get("/api/pokemon/1", {
      headers: { authorization },
    });

    expect(paid.status()).toBe(200);
    expect(await paid.json()).toEqual(
      expect.objectContaining({ id: 1, name: "bulbasaur" }),
    );
  });

  test("tampered credential returns 401", async ({ request }) => {
    const challengeResponse = await request.get("/api/pokemon/1");
    const payment = await request.post("/api/pokemon/1", {
      data: { challenge: requireAuthenticateChallenge(challengeResponse.headers()) },
    });
    const { authorization } = (await payment.json()) as { authorization: string };
    const tampered = `${authorization.slice(0, -1)}${authorization.endsWith("0") ? "1" : "0"}`;

    const paid = await request.get("/api/pokemon/1", {
      headers: { authorization: tampered },
    });

    expect(paid.status()).toBe(401);
  });

  test("production-like config fails closed without backend credentials", async () => {
    await expect(
      createProductionPokedexPaymentRuntime({ NODE_ENV: "production" }),
    ).rejects.toThrow(PaymentConfigError);
    await expect(
      createProductionPokedexPaymentRuntime({ NODE_ENV: "production" }),
    ).rejects.toThrow(
      "Set BOLTWALL_PLAYGROUND_BACKEND=lnd or voltage-lnd",
    );
  });
});

function requireAuthenticateChallenge(headers: Record<string, string>): string {
  const challenge = headers["www-authenticate"];
  expect(challenge).toBeDefined();
  if (challenge === undefined) {
    throw new Error("Missing WWW-Authenticate challenge");
  }
  return challenge;
}

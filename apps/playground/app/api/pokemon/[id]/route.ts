import { authorizeL402 } from "@boltwall/middleware";
import { z } from "zod";

import { PaymentConfigError, getPokedexPaymentRuntime } from "../../../../lib/server/payment-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TestPaymentRequest = z.object({
  challenge: z.string().min(1),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const runtimeConfig = await getPokedexPaymentRuntime();
  const gate = await authorizeL402(request, runtimeConfig.config);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (runtimeConfig.pokeApiMode === "fixture") {
    return Response.json(pokemonFixture(id));
  }

  const upstream = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function POST(request: Request) {
  const runtimeConfig = await getPokedexPaymentRuntime();
  if (runtimeConfig.testPayments === undefined) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const body = TestPaymentRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }

  try {
    return Response.json({
      authorization: await runtimeConfig.testPayments.settleChallenge(body.data.challenge),
    });
  } catch (error) {
    const message =
      error instanceof PaymentConfigError ? error.message : "Unable to settle mock payment";
    return Response.json({ error: message }, { status: 400 });
  }
}

function pokemonFixture(id: string) {
  const numericId = Number.parseInt(id, 10);
  return {
    id: Number.isFinite(numericId) ? numericId : id,
    name: id === "1" ? "bulbasaur" : `pokemon-${id}`,
    source: "boltwall-playground-fixture",
  };
}

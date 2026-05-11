"use client";

import {
  buildAuthorizationHeader,
  parseAuthenticateHeader,
  type L402ChallengeFields,
} from "@boltwall/l402";
import { useMemo, useState } from "react";

const sampleChallenge =
  'LSAT macaroon="AgEDbHRuYndhbGwCCmNoYWxsZW5nZQACIPQx7kZ80cv2A8x9uG0ew7Wb4uKQm7W6b4j7e51p9n7i", invoice="lnbc1500n1pj9x8dapp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"';
const samplePreimage = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

type ParsedChallenge = {
  fields: L402ChallengeFields[];
  error: string | null;
};

function parseChallenge(source: string): ParsedChallenge {
  try {
    return { fields: parseAuthenticateHeader(source), error: null };
  } catch (error) {
    return {
      fields: [],
      error: error instanceof Error ? error.message : "invalid-challenge",
    };
  }
}

export default function HomePage() {
  const [challenge, setChallenge] = useState(sampleChallenge);
  const [preimage, setPreimage] = useState(samplePreimage);
  const [endpoint, setEndpoint] = useState("/api/protected/pokedex");
  const [requestState, setRequestState] = useState("Ready to request an L402-protected endpoint.");

  const parsed = useMemo(() => parseChallenge(challenge), [challenge]);
  const activeChallenge = parsed.fields[0];
  const token =
    activeChallenge && preimage
      ? buildAuthorizationHeader({
          macaroons: activeChallenge.macaroon,
          preimage,
          legacy: activeChallenge.scheme === "LSAT",
        })
      : "";

  async function requestEndpoint() {
    setRequestState("Requesting endpoint...");

    try {
      const headers = new Headers();
      if (token) headers.set("Authorization", token);

      const response = await fetch(endpoint, {
        cache: "no-store",
        headers,
      });
      const nextChallenge = response.headers.get("www-authenticate");
      if (nextChallenge) setChallenge(nextChallenge);

      setRequestState(
        nextChallenge
          ? `HTTP ${response.status}. Challenge loaded into the editor.`
          : `HTTP ${response.status}. No L402 challenge header was returned.`,
      );
    } catch (error) {
      setRequestState(error instanceof Error ? error.message : "Endpoint request failed.");
    }
  }

  return (
    <main className="playground-shell">
      <header className="page-header">
        <p className="eyebrow">Boltwall Playground</p>
        <h1>L402 playground</h1>
        <p>
          Build, parse, edit, and retry L402 credentials. The live endpoint panel is the place where
          the real protected API plugs in as the backend lands.
        </p>
      </header>

      <section className="workspace" aria-label="L402 learning workspace">
        <section className="editor-panel" aria-labelledby="challenge-heading">
          <div className="panel-heading">
            <span>1</span>
            <div>
              <h2 id="challenge-heading">Challenge</h2>
              <p>Edit a WWW-Authenticate challenge and inspect the fields it carries.</p>
            </div>
          </div>
          <label className="field">
            <span>WWW-Authenticate</span>
            <textarea value={challenge} onChange={(event) => setChallenge(event.target.value)} />
          </label>
          <ParsedRows parsed={parsed} />
        </section>

        <section className="editor-panel" aria-labelledby="token-heading">
          <div className="panel-heading">
            <span>2</span>
            <div>
              <h2 id="token-heading">Credential</h2>
              <p>Add a preimage to build the Authorization token sent on retry.</p>
            </div>
          </div>
          <label className="field">
            <span>Preimage</span>
            <input value={preimage} onChange={(event) => setPreimage(event.target.value)} />
          </label>
          <label className="field">
            <span>Authorization</span>
            <textarea readOnly value={token} />
          </label>
        </section>

        <section className="live-panel" aria-labelledby="endpoint-heading">
          <div className="panel-heading">
            <span>3</span>
            <div>
              <h2 id="endpoint-heading">Protected endpoint</h2>
              <p>Use the same challenge and credential shape against a live L402 route.</p>
            </div>
          </div>
          <label className="field">
            <span>Endpoint URL</span>
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
          </label>
          <div className="request-row">
            <button type="button" onClick={requestEndpoint}>
              Request endpoint
            </button>
            <code>{endpoint}</code>
          </div>
          <output className="request-output">{requestState}</output>
        </section>
      </section>
    </main>
  );
}

function ParsedRows({ parsed }: { parsed: ParsedChallenge }) {
  const first = parsed.fields[0];
  const rows = [
    ["scheme", first?.scheme ?? "missing"],
    ["macaroon", first?.macaroon ?? "missing"],
    ["invoice", first?.invoice ?? "missing"],
    ["challenges", parsed.fields.length.toString()],
  ];

  return (
    <>
      <dl className="parsed-grid" aria-label="Parsed challenge fields">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {parsed.error ? (
        <p className="parser-error" role="status">
          Parser error: {parsed.error}
        </p>
      ) : null}
    </>
  );
}

import { notFound } from "next/navigation";

// Panel routes use nuqs URL state, so disable static prerendering.
export const dynamic = "force-dynamic";

import { AddExpiration } from "../../../components/panels/AddExpiration";
import { Caveats } from "../../../components/panels/Caveats";
import { Demo } from "../../../components/panels/Demo";
import { FromChallenge } from "../../../components/panels/FromChallenge";
import { GenerateL402Token } from "../../../components/panels/GenerateL402Token";
import { ParseToken } from "../../../components/panels/ParseToken";
import { SatisfyL402 } from "../../../components/panels/SatisfyL402";
import { SigningKey } from "../../../components/panels/SigningKey";
import { ValidateL402 } from "../../../components/panels/ValidateL402";

type Props = {
  params: Promise<{ panel: string }>;
};

export function generateStaticParams() {
  return [
    { panel: "signing-key" },
    { panel: "from-invoice" },
    { panel: "from-challenge" },
    { panel: "parse-token" },
    { panel: "caveats" },
    { panel: "add-expiration" },
    { panel: "validate" },
    { panel: "satisfy" },
    { panel: "demo" },
  ];
}

export default async function PanelPage({ params }: Props) {
  const { panel } = await params;

  const panelMap: Record<string, React.ReactNode> = {
    "signing-key": <SigningKey />,
    "from-invoice": <GenerateL402Token />,
    "from-challenge": <FromChallenge />,
    "parse-token": <ParseToken />,
    caveats: <Caveats />,
    "add-expiration": <AddExpiration />,
    validate: <ValidateL402 />,
    satisfy: <SatisfyL402 />,
    demo: <Demo />,
  };

  const component = panelMap[panel];
  if (!component) notFound();

  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 24px",
      }}
    >
      {component}
    </main>
  );
}

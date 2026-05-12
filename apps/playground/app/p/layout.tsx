import type { ReactNode } from "react";

import { WorkbenchMemoryProvider } from "../../lib/url-state";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <WorkbenchMemoryProvider>{children}</WorkbenchMemoryProvider>;
}

import type { ReactNode } from "react";

import { WorkbenchMemoryStrip } from "../../components/ui/workbench-memory-strip";
import { WorkbenchMemoryProvider } from "../../lib/url-state";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <WorkbenchMemoryProvider>
      <WorkbenchMemoryStrip />
      {children}
    </WorkbenchMemoryProvider>
  );
}

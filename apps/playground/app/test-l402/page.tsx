import { notFound } from "next/navigation";

export default process.env.NODE_ENV === "production"
  ? function TestL402Page() {
      notFound();
    }
  : async function TestL402Page() {
      const { TestL402Harness } = await import("./TestL402Harness");

      return (
        <main style={{ padding: 24 }}>
          <TestL402Harness />
        </main>
      );
    };

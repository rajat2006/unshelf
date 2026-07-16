import type { ReactNode } from "react";

/**
 * The responsive boundary shared by every signed-in and signed-out screen.
 * Keeping the width and padding policy here gives browser smoke tests the same
 * ancestor the production Stops UI has, so a shell regression cannot hide behind
 * an isolated component test.
 */
export function ResponsiveAppShell({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "clamp(1rem, 4vw, 2rem)",
        boxSizing: "border-box",
      }}
    >
      {children}
    </main>
  );
}

import { Outlet } from "react-router";
import { CaptureProvider } from "./CaptureProvider";
import { TopBar } from "./TopBar";

/**
 * The signed-in frame: the persistent top bar above a surface region. The top
 * bar stays put while `Outlet` swaps the surface, so a surface-scoped error or
 * skeleton never removes the chrome (design spec §6). The surface region uses
 * clamped padding and a max width so content reflows to phone width with no
 * page-level horizontal scroll (ADR-0008).
 *
 * `CaptureProvider` scopes the global Capture overlay and its shortcuts to the
 * signed-in shell, so intake is reachable from every surface here and absent from
 * `/sign-in` (ADR-0014).
 */
export function Shell() {
  return (
    <CaptureProvider>
      <div className="min-h-svh bg-background text-foreground">
        <TopBar />
        <main className="mx-auto w-full min-w-0 max-w-[80rem] px-4 py-8 md:px-6 md:py-10 has-[.learning-plan-surface]:max-w-none has-[.learning-plan-surface]:p-0">
          <Outlet />
        </main>
      </div>
    </CaptureProvider>
  );
}

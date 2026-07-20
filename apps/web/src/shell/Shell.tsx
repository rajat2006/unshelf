import { Outlet } from "react-router";
import { CaptureProvider } from "./CaptureController";
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
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
    </CaptureProvider>
  );
}

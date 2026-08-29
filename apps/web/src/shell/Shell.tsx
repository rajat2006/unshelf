import { Outlet } from "react-router";
import { CaptureProvider } from "./CaptureProvider";
import { TopBar } from "./TopBar";
import { ServerCalendarProvider } from "../server-calendar/ServerCalendarProvider";
import { ItemRecoveryNotice } from "../items/ItemRecoveryNotice";

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
      <ServerCalendarProvider>
        <div className="min-h-svh bg-background text-foreground has-[.discover-setup]:flex has-[.discover-setup]:h-svh has-[.discover-setup]:flex-col has-[.discover-setup]:overflow-hidden lg:has-[.discover-surface]:flex lg:has-[.discover-surface]:h-svh lg:has-[.discover-surface]:flex-col lg:has-[.discover-surface]:overflow-hidden">
          <TopBar />
          <main className="mx-auto w-full min-w-0 max-w-[80rem] px-4 py-8 has-[.discover-setup]:min-h-0 has-[.discover-setup]:flex-1 has-[.discover-setup]:overflow-hidden md:px-6 md:py-10 lg:has-[.discover-surface]:min-h-0 lg:has-[.discover-surface]:flex-1 lg:has-[.discover-surface]:overflow-hidden lg:has-[.discover-surface]:py-6 has-[.learning-plan-surface]:max-w-none has-[.learning-plan-surface]:p-0">
            <ItemRecoveryNotice />
            <Outlet />
          </main>
        </div>
      </ServerCalendarProvider>
    </CaptureProvider>
  );
}

import { useEffect } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useApplicationAuth } from "./application-auth";
import { AuthPlaceholder } from "./shell/AuthPlaceholder";
import { NotFound } from "./shell/NotFound";
import { Shell } from "./shell/Shell";
import { SignInScreen } from "./shell/SignInScreen";
import { HomeSurface } from "./surfaces/HomeSurface";
import { ItemSurface } from "./surfaces/ItemSurface";
import { LibrarySurface } from "./surfaces/LibrarySurface";
import { TrailSurface } from "./surfaces/TrailSurface";

/**
 * The routed Unshelf shell (design spec §3–§5, ADR-0013).
 *
 * Auth resolution precedes route gating: while it resolves, only the neutral
 * wordmark placeholder shows — no route flashes a sign-in wall or signed-out
 * content. Once resolved, `/sign-in` is the single auth route; every other route
 * requires a signed-in User, so a signed-out visitor is redirected to sign-in
 * with their intended destination preserved. Signing in restores that
 * destination; an unknown route recovers to Home.
 */
export function App() {
  const { status } = useApplicationAuth();

  if (status === "loading") {
    return <AuthPlaceholder />;
  }

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<HomeSurface />} />
          <Route path="library" element={<LibrarySurface />} />
          <Route path="trails/:trailId" element={<TrailSurface />} />
          <Route
            path="trails/:trailId/stops/:stopId"
            element={<TrailSurface />}
          />
          <Route path="items/:itemId" element={<ItemSurface />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

/**
 * Gate every private surface. A signed-out visitor is sent to `/sign-in` with
 * the route they intended carried in history state, so it can be restored once
 * they sign in.
 */
function RequireAuth() {
  const { status } = useApplicationAuth();
  const location = useLocation();
  if (status === "signed-out") {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/**
 * The `/sign-in` route: the chrome-less screen while signed out, and — once auth
 * resolves signed-in — a redirect to the intended private route (or Home when
 * there was none, e.g. a signed-in User visiting `/sign-in` directly).
 */
function SignInRoute() {
  const { status } = useApplicationAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const intended = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname;
  const destination = intended ?? "/";

  useEffect(() => {
    if (status === "signed-in") {
      navigate(destination, { replace: true });
    }
  }, [status, destination, navigate]);

  if (status === "signed-in") {
    return null;
  }
  return <SignInScreen />;
}

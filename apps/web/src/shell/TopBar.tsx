import { Plus } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { UserButton } from "../application-auth/UserButton";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  itemBackgroundSurface,
  readItemBackgroundLocation,
} from "../items/item-route-state";
import { ThemeControl } from "./ThemeControl";
import { useCapture } from "./useCapture";
import { Wordmark } from "./Wordmark";
import { isDiscoverEnabled } from "../discover/feature";

/**
 * The four-room top bar, present on every signed-in surface. The room links use
 * the local Navigation Menu catalogue boundary, while Capture remains a global,
 * non-navigating action. Current-room text and `aria-current` accompany the
 * accent treatment so state is never conveyed by colour alone.
 */
export function TopBar() {
  const { open } = useCapture();
  const location = useLocation();
  const backgroundLocation = location.pathname.startsWith("/items/")
    ? readItemBackgroundLocation(location.state)
    : null;
  const backgroundSurface = itemBackgroundSurface(backgroundLocation);
  const libraryActive =
    location.pathname === "/library" ||
    (location.pathname.startsWith("/items/") &&
      (backgroundSurface.kind === "library" ||
        backgroundSurface.kind === "unknown"));
  const plansActive =
    location.pathname.startsWith("/plans") || backgroundSurface.kind === "plan";
  const todayActive =
    location.pathname.startsWith("/today") ||
    backgroundSurface.kind === "today" ||
    backgroundSurface.kind === "history";
  const discoverEnabled = isDiscoverEnabled();

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-[80rem] flex-wrap items-center gap-3 px-4 py-2 md:px-6 lg:flex-nowrap">
        <NavLink
          to="/today"
          aria-label="Unshelf — go to Today"
          className="group inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-small)] pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          end
        >
          <Wordmark />
        </NavLink>

        <NavigationMenu
          aria-label="Primary rooms"
          className="order-3 w-full max-w-none justify-start overflow-x-auto border-t pt-2 lg:order-none lg:w-auto lg:overflow-visible lg:border-0 lg:pt-0"
        >
          <NavigationMenuList className="w-max justify-start gap-1">
            <RoomLink to="/today" label="Today" active={todayActive} />
            {discoverEnabled ? (
              <RoomLink
                to="/discover"
                label="Discover"
                active={location.pathname.startsWith("/discover")}
              />
            ) : (
              <NavigationMenuItem>
                <Button
                  type="button"
                  variant="quiet"
                  className="h-10 gap-1.5 px-3 text-muted-foreground"
                  aria-label="Discover — Coming later"
                  disabled
                >
                  <span>Discover</span>
                  <span className="text-xs font-normal">Coming later</span>
                </Button>
              </NavigationMenuItem>
            )}
            <RoomLink to="/library" label="Library" active={libraryActive} />
            <RoomLink to="/plans" label="Plans" active={plansActive} />
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeControl />
          <Button
            type="button"
            onClick={open}
            aria-label="Capture"
            className="px-3 sm:px-4"
          >
            <Plus aria-hidden="true" />
            <span className="hidden sm:inline">Capture</span>
            <span className="sm:hidden">Add</span>
            <span className="sr-only sm:hidden"> Item</span>
          </Button>
          <div className="grid min-h-11 min-w-11 place-items-center rounded-full focus-within:ring-3 focus-within:ring-ring/30 [&_button]:min-h-11 [&_button]:min-w-11">
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  );
}

function RoomLink({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <NavigationMenuItem>
      <NavigationMenuLink asChild active={active}>
        <Link
          to={to}
          className="relative h-10 rounded-[var(--radius-small)] px-3 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[active]:bg-accent data-[active]:font-semibold data-[active]:text-accent-foreground data-[active]:after:absolute data-[active]:after:inset-x-3 data-[active]:after:bottom-0 data-[active]:after:h-0.5 data-[active]:after:bg-primary"
          aria-current={active ? "page" : undefined}
        >
          {label}
        </Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

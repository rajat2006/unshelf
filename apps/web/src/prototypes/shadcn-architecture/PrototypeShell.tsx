import type { ReactNode } from "react";
import { BookOpenText, Moon, Plus, Sun, UserRound } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { PrototypeTheme } from "./ArchitecturePrototype";

export function PrototypeShell({
  children,
  theme,
  onThemeChange,
  onCapture,
}: {
  children: ReactNode;
  theme: PrototypeTheme;
  onThemeChange: (theme: PrototypeTheme) => void;
  onCapture: () => void;
}) {
  return (
    <div className="min-h-svh bg-background pb-32 text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-3 px-4 py-3 md:px-6 lg:flex-nowrap">
          <Link
            to="/"
            className="group flex min-h-10 shrink-0 items-center gap-3 rounded-md pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
            aria-label="Unshelf — Library prototype"
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground transition-colors group-hover:bg-primary/88">
              <BookOpenText aria-hidden="true" className="size-4" />
            </span>
            <span className="font-serif text-xl font-semibold tracking-tight">
              Unshelf
            </span>
          </Link>

          <nav
            aria-label="Primary rooms"
            className="order-3 flex w-full items-center gap-1 overflow-x-auto border-t pt-3 lg:order-none lg:w-auto lg:border-0 lg:pt-0"
          >
            <Button variant="ghost" className="shrink-0" aria-disabled="true">
              Today
            </Button>
            <Button
              variant="ghost"
              className="shrink-0 gap-2"
              disabled
              aria-label="Discover — coming later"
            >
              Discover
              <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                Later
              </span>
            </Button>
            <Button asChild variant="secondary" className="shrink-0">
              <Link to="/" aria-current="page">
                Library
              </Link>
            </Button>
            <Button variant="ghost" className="shrink-0" aria-disabled="true">
              Plans
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Use ${theme === "light" ? "Dark" : "Light"} theme`}
                  onClick={() =>
                    onThemeChange(theme === "light" ? "dark" : "light")
                  }
                >
                  {theme === "light" ? (
                    <Moon aria-hidden="true" />
                  ) : (
                    <Sun aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {theme === "light" ? "Dark appearance" : "Light appearance"}
              </TooltipContent>
            </Tooltip>

            <Button type="button" onClick={onCapture}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span className="hidden sm:inline">Capture</span>
              <span className="sm:hidden">Add</span>
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Account menu"
                >
                  <UserRound aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Account</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[80rem] px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}

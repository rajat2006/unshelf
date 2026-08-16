import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { AuthPlaceholder } from "./AuthPlaceholder";
import { CaptureContext } from "./capture-context";
import { NotFound } from "./NotFound";
import { SignInScreen } from "./SignInScreen";
import { TopBar } from "./TopBar";

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function renderTopBar(path: string) {
  return renderToStaticMarkup(
    <ApplicationAuthProvider auth={auth}>
      <CaptureContext.Provider
        value={{ open: () => undefined, subscribe: () => () => undefined }}
      >
        <MemoryRouter initialEntries={[path]}>
          <TopBar />
        </MemoryRouter>
      </CaptureContext.Provider>
    </ApplicationAuthProvider>,
  );
}

describe("routed shell states", () => {
  it("shows only a named loading state while authentication resolves", () => {
    const markup = renderToStaticMarkup(<AuthPlaceholder />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading Unshelf"');
    expect(markup).not.toContain("Sign in with Google");
  });

  it("offers the single sign-in action without signed-in navigation", () => {
    const markup = renderToStaticMarkup(
      <ApplicationAuthProvider auth={{ ...auth, status: "signed-out" }}>
        <SignInScreen />
      </ApplicationAuthProvider>,
    );

    expect(markup).toContain("Sign in with Google");
    expect(markup).not.toContain("Primary rooms");
  });

  it("marks the current room and keeps deferred Discover unavailable", () => {
    const markup = renderTopBar("/library");

    expect(markup).toContain('aria-label="Primary rooms"');
    expect(markup).toMatch(/aria-current="page"[^>]+href="\/library"/);
    expect(markup).toContain('aria-label="Discover — Coming later"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Capture");
  });

  it("enables Discover navigation only behind its deployment flag", () => {
    vi.stubEnv("VITE_DISCOVER_ENABLED", "true");
    const markup = renderTopBar("/discover");

    expect(markup).toMatch(/aria-current="page"[^>]+href="\/discover"/);
    expect(markup).not.toContain("Coming later");
  });

  it("keeps stale-route recovery inside the workspace", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(markup).toContain("This page doesn&#x27;t exist");
    expect(markup).toContain('href="/today"');
    expect(markup).toContain("Go to Today");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

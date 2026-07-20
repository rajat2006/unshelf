import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Trail, TrailId, UserId } from "@unshelf/shared";
import { TrailsIndex, type TrailsIndexState } from "./TrailsIndex";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;

const trail = (id: string, name: string, done: number, total: number): Trail => ({
  id: id as TrailId,
  userId,
  name,
  createdAt: "2026-07-01T00:00:00.000Z",
  done,
  total,
});

const render = (state: TrailsIndexState) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TrailsIndex
        state={state}
        creating={false}
        onCreate={async () => undefined}
        onRetry={() => undefined}
      />
    </MemoryRouter>,
  );

describe("Trails index surface states", () => {
  it("lists each Trail as a link to its stable URL with derived progress", () => {
    const markup = render({
      status: "ready",
      trails: [
        trail("11111111-1111-1111-1111-111111111111", "Learn Rust", 2, 5),
        trail("22222222-2222-2222-2222-222222222222", "Empty journey", 0, 0),
      ],
    });

    expect(markup).toContain("Learn Rust");
    expect(markup).toContain("2 of 5 done");
    // A Trail opens at its opaque id, so the card links there.
    expect(markup).toContain(
      'href="/trails/11111111-1111-1111-1111-111111111111"',
    );
    // A Trail with no Items reads as unstarted, not 0/0 noise.
    expect(markup).toContain("Empty journey");
    expect(markup).toContain("No progress yet");
  });

  it("offers start-a-Trail when the index is empty", () => {
    const markup = render({ status: "ready", trails: [] });

    expect(markup).toContain("No Trails yet");
    expect(markup).toContain("Start a Trail");
  });

  it("shows card-shaped skeletons while loading, not a spinner", () => {
    const markup = render({ status: "loading" });

    expect(markup).toContain("Loading Trails");
  });

  it("shows an inline error with a retry that keeps the shell", () => {
    const markup = render({ status: "error" });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("load this");
    expect(markup).toContain("Retry");
  });
});

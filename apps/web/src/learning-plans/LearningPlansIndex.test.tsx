import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { LearningPlan, LearningPlanId, UserId } from "@unshelf/shared";
import {
  LearningPlansIndex,
  type LearningPlansIndexState,
} from "./LearningPlansIndex";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;

const learningPlan = ({
  id,
  name,
  done,
  total,
  archivedAt = null,
}: {
  id: string;
  name: string;
  done: number;
  total: number;
  archivedAt?: string | null;
}): LearningPlan => ({
  id: id as LearningPlanId,
  userId,
  name,
  createdAt: "2026-07-01T00:00:00.000Z",
  archivedAt,
  done,
  total,
});

const render = (state: LearningPlansIndexState) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LearningPlansIndex
        state={state}
        creating={false}
        onCreate={async () => undefined}
        onArchive={async () => undefined}
        onRestore={async () => undefined}
        onRetry={() => undefined}
      />
    </MemoryRouter>,
  );

describe("Learning Plans index surface states", () => {
  it("lists each LearningPlan as a link to its stable URL with derived progress", () => {
    const markup = render({
      status: "ready",
      learningPlans: [
        learningPlan({
          id: "11111111-1111-1111-1111-111111111111",
          name: "Learn Rust",
          done: 2,
          total: 5,
        }),
        learningPlan({
          id: "22222222-2222-2222-2222-222222222222",
          name: "Empty journey",
          done: 0,
          total: 0,
        }),
      ],
    });

    expect(markup).toContain("Learn Rust");
    expect(markup).toContain("2 of 5 done");
    // A LearningPlan opens at its opaque id, so the card links there.
    expect(markup).toContain(
      'href="/plans/11111111-1111-1111-1111-111111111111"',
    );
    // A LearningPlan with no Items names what is missing, not progress that cannot exist.
    expect(markup).toContain("Empty journey");
    expect(markup).toContain("No items added yet");
  });

  it("offers start-a-LearningPlan when the index is empty", () => {
    const markup = render({ status: "ready", learningPlans: [] });

    expect(markup).toContain("No Learning Plans yet");
    expect(markup).toContain("Start a Learning Plan");
  });

  it("separates active and archived Learning Plans with explicit lifecycle actions", () => {
    const markup = render({
      status: "ready",
      learningPlans: [
        learningPlan({
          id: "11111111-1111-1111-1111-111111111111",
          name: "Active journey",
          done: 1,
          total: 2,
        }),
        learningPlan({
          id: "22222222-2222-2222-2222-222222222222",
          name: "Archived journey",
          done: 0,
          total: 0,
          archivedAt: "2026-08-11T12:00:00.000Z",
        }),
      ],
    });

    expect(markup).toContain("Active Plans");
    expect(markup).toContain("Archived Plans");
    expect(markup).toContain("Archive Active journey");
    expect(markup).toContain("Restore Archived journey");
    expect(markup).toContain("No items added yet");
  });

  it("shows card-shaped skeletons while loading, not a spinner", () => {
    const markup = render({ status: "loading" });

    expect(markup).toContain("Loading Learning Plans");
  });

  it("shows an inline error with a retry that keeps the shell", () => {
    const markup = render({ status: "error" });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("load this");
    expect(markup).toContain("Retry");
  });
});

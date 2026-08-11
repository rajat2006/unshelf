import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  Status,
  Type,
  type Item,
  type ItemId,
  type LearningPlanId,
  type Stage,
  type StageDetail,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { StagesSection } from "./StagesSection";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const stageId = "00000000-0000-0000-0000-000000000002" as StageId;
const learningPlanId = "00000000-0000-0000-0000-000000000005" as LearningPlanId;

const user: CurrentUser = {
  getToken: async () => null,
};

const stages: Stage[] = [
  { id: stageId, userId, learningPlanId, name: "Learn CSS" },
  {
    id: "00000000-0000-0000-0000-000000000003" as StageId,
    userId,
    learningPlanId,
    name: "Build the API",
  },
];

const item: Item = {
  id: "00000000-0000-0000-0000-000000000004" as ItemId,
  userId,
  title: "Responsive layouts",
  source: "https://example.com/layouts",
  type: Type.Article,
  status: Status.InProgress,
  targetDate: "2026-08-01",
  pastTarget: false,
  completedAt: null,
  labels: [],
};

const renderStages = (openStage: StageDetail | null) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/plans/learning-plan-1/stages/${stageId}`]}>
      <StagesSection
        stages={stages}
        openStage={openStage}
        error={null}
        user={user}
        onStageOpened={() => undefined}
        onStageChanged={() => undefined}
        onItemChanged={() => undefined}
      />
    </MemoryRouter>,
  );

describe("Stages smoke coverage", () => {
  it("renders every Stage as an operable list choice", () => {
    const markup = renderStages(null);

    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    expect(markup.match(/<button/g)).toHaveLength(2);
  });

  it("renders a Stage detail with the Item facts shared by All", () => {
    const markup = renderStages({ ...stages[0], items: [item] });

    expect(markup).toContain("Responsive layouts");
    expect(markup).toContain("In progress");
    expect(markup).toContain("2026-08-01");
    expect(markup).toContain("https://example.com/layouts");
    expect(markup).toContain("Remove from stage");
    expect(markup).toContain("All stages");
  });

  it("describes an empty Stage without implying progress", () => {
    const markup = renderStages({ ...stages[0], items: [] });

    expect(markup).toContain("No items added to this Stage yet");
    expect(markup).not.toContain("0 of 0");
  });
});

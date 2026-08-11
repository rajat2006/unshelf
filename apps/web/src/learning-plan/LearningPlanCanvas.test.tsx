import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  PlanNodeKind,
  Status,
  Type,
  type DirectItemNodeId,
  type ItemId,
  type LearningPlanId,
  type LearningPlanView,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { LearningPlanCanvas } from "./LearningPlanCanvas";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-0000000000t1" as LearningPlanId;
const a = "00000000-0000-0000-0000-00000000000a" as StageId;
const b = "00000000-0000-0000-0000-00000000000b" as StageId;
const directA = "00000000-0000-0000-0000-00000000001a" as DirectItemNodeId;
const directB = "00000000-0000-0000-0000-00000000001b" as DirectItemNodeId;

const user: CurrentUser = { getToken: async () => null };

const directItemNode = ({
  id,
  itemId,
  title,
}: {
  id: DirectItemNodeId;
  itemId: ItemId;
  title: string;
}) => ({
  kind: PlanNodeKind.Item as const,
  id,
  item: {
    id: itemId,
    userId,
    title,
    source: null,
    type: Type.Book,
    status: Status.NotStarted,
    targetDate: null,
    pastTarget: false,
    completedAt: null,
    labels: [],
  },
});

// A → B, where A is fully done (its ground is "walked") and B is underway.
const learningPlan: LearningPlanView = {
  nodes: [
    {
      kind: PlanNodeKind.Stage,
      id: a,
      name: "Learn CSS",
      done: 4,
      total: 4,
    },
    {
      kind: PlanNodeKind.Stage,
      id: b,
      name: "Build the API",
      done: 1,
      total: 3,
    },
  ],
  edges: [{ userId, fromNodeId: a, toNodeId: b }],
};

const render = (readOnly: boolean, view: LearningPlanView = learningPlan) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LearningPlanCanvas
        learningPlanId={learningPlanId}
        learningPlan={view}
        user={user}
        onLearningPlanChanged={() => undefined}
        onRefresh={async () => undefined}
        onOpenStage={() => undefined}
        readOnly={readOnly}
      />
    </MemoryRouter>,
  );

describe("Learning Plan canvas — Quiet Focus", () => {
  it("draws each Stage as a waypoint with its name and progress", () => {
    const markup = render(false);

    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    expect(markup).toContain("1/3"); // the underway ring shows its fraction
    expect(markup).toContain("You are here"); // B is the frontier
    expect(markup).toContain("<path"); // the learningPlan is drawn as segments
    expect(markup).toContain("Completed stage");
    expect(markup).toContain("Solid path: walked");
    expect(markup).toContain("Dotted path: ahead");
    expect(markup).not.toContain("Compass");
    expect(markup).not.toContain("ochre");
    expect(markup).not.toContain("pine");
  });

  it("offers arranging controls on desktop", () => {
    const markup = render(false);

    // ＋ next, ⑃ fork, ⇢ link, ✕ remove-link — arranging, not data entry.
    expect(markup).toContain("Add the next stage in sequence");
    expect(markup).toContain("Fork a parallel branch");
    expect(markup).toContain("Remove this link");
  });

  it("offers graph authoring controls on direct Item nodes", () => {
    const view: LearningPlanView = {
      nodes: [
        directItemNode({
          id: directA,
          itemId: "00000000-0000-0000-0000-00000000002a" as ItemId,
          title: "Domain-Driven Design",
        }),
        directItemNode({
          id: directB,
          itemId: "00000000-0000-0000-0000-00000000002b" as ItemId,
          title: "Implementing Domain-Driven Design",
        }),
      ],
      edges: [{ userId, fromNodeId: directA, toNodeId: directB }],
    };

    const markup = render(false, view);

    expect(markup).toContain("Link from Domain-Driven Design to another node");
    expect(markup).toContain(
      "Link from Implementing Domain-Driven Design to another node",
    );
  });

  it("offers to sequence a loose direct Item after any Plan Node", () => {
    const looseItem = directItemNode({
      id: directA,
      itemId: "00000000-0000-0000-0000-00000000002a" as ItemId,
      title: "Domain-Driven Design",
    });
    const view: LearningPlanView = {
      nodes: [...learningPlan.nodes, looseItem],
      edges: learningPlan.edges,
    };

    const markup = render(false, view);

    expect(markup).toContain("Sequence Domain-Driven Design");
    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
  });

  it("is read-only at phone width — viewable, not authored", () => {
    const markup = render(true);

    expect(markup).toContain("Learn CSS"); // still drawn (US 40)…
    expect(markup).toContain("Build the API");
    expect(markup).not.toContain("Add the next stage in sequence"); // …not authored
    expect(markup).not.toContain("Remove this link");
  });

  it("invites the first Stage when the learningPlan is empty (desktop only)", () => {
    expect(render(false, { nodes: [], edges: [] })).toContain(
      "Start your Learning Plan",
    );
    expect(render(true, { nodes: [], edges: [] })).not.toContain(
      "Start your Learning Plan",
    );
  });
});

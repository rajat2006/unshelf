import { describe, expect, it } from "vitest";
import { decidePromotion } from "./promote-queued";

describe("decidePromotion — auto-promote a queued dependent when its last blocker closes", () => {
  it("promotes an agent:queued dependent once every blocker is closed", () => {
    const { promote } = decidePromotion({
      labels: ["ready-for-agent", "agent:queued"],
      blockers: [{ number: 62, state: "closed" }],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(true);
  });

  it("treats the just-closed blocker as closed even if the API still reports it open", () => {
    // Eventual consistency: the close event fired but the dependency summary /
    // blocked_by list can momentarily still say the blocker is open.
    const { promote } = decidePromotion({
      labels: ["agent:queued"],
      blockers: [{ number: 62, state: "open" }],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(true);
  });

  it("keeps a dependent queued while another blocker is still open", () => {
    const { promote, reason } = decidePromotion({
      labels: ["agent:queued"],
      blockers: [
        { number: 62, state: "closed" },
        { number: 63, state: "open" },
      ],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(false);
    expect(reason).toContain("#63");
  });

  it("does not promote an issue that is not agent:queued", () => {
    const { promote } = decidePromotion({
      labels: ["ready-for-agent"],
      blockers: [{ number: 62, state: "closed" }],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(false);
  });

  it("does not promote when a human pulled the issue out with ready-for-human", () => {
    const { promote, reason } = decidePromotion({
      labels: ["agent:queued", "ready-for-human"],
      blockers: [{ number: 62, state: "closed" }],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(false);
    expect(reason).toContain("ready-for-human");
  });

  it("promotes when the dependent had only the one blocker that just closed", () => {
    const { promote } = decidePromotion({
      labels: ["agent:queued"],
      blockers: [],
      closedBlockerNumber: 62,
    });

    expect(promote).toBe(true);
  });
});

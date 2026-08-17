import { describe, expect, it } from "vitest";
import { type UserId } from "@unshelf/shared";
import { createSourceInspectionAdmissionGate } from "./admission-gate";

const firstUser = "a156d86a-09d3-4935-9bf0-1820fa357f90" as UserId;
const secondUser = "ad8156a5-2889-47d7-bb4a-8fd36590b19d" as UserId;

describe("Source inspection admission gate", () => {
  it("refuses immediately above the per-User active-attempt limit", () => {
    const gate = createSourceInspectionAdmissionGate();
    const first = gate.tryAcquire({
      userId: firstUser,
      hostname: "first.example",
    });
    const second = gate.tryAcquire({
      userId: firstUser,
      hostname: "second.example",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      gate.tryAcquire({ userId: firstUser, hostname: "third.example" }),
    ).toEqual({ ok: false, error: "overload" });

    if (first.ok) first.permit.release();
    if (second.ok) second.permit.release();
  });

  it("refuses immediately above the per-host active-attempt limit", () => {
    const gate = createSourceInspectionAdmissionGate();
    const first = gate.tryAcquire({
      userId: firstUser,
      hostname: "shared.example",
    });
    const second = gate.tryAcquire({
      userId: secondUser,
      hostname: "shared.example",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      gate.tryAcquire({
        userId: "77a58cf6-a808-4a60-ad1f-6a82dec7df95" as UserId,
        hostname: "shared.example",
      }),
    ).toEqual({ ok: false, error: "overload" });

    if (first.ok) first.permit.release();
    if (second.ok) second.permit.release();
  });

  it("refuses immediately above the process active-attempt limit", () => {
    const gate = createSourceInspectionAdmissionGate();
    const permits = Array.from({ length: 16 }, (_, index) =>
      gate.tryAcquire({
        userId:
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as UserId,
        hostname: `${index}.example`,
      }),
    );

    expect(permits.every((admission) => admission.ok)).toBe(true);
    expect(
      gate.tryAcquire({
        userId: "77a58cf6-a808-4a60-ad1f-6a82dec7df95" as UserId,
        hostname: "overflow.example",
      }),
    ).toEqual({ ok: false, error: "overload" });

    for (const admission of permits) {
      if (admission.ok) admission.permit.release();
    }
  });

  it("allows five starts per User and refills twenty starts per minute", () => {
    let nowMs = 1_000;
    const gate = createSourceInspectionAdmissionGate({ now: () => nowMs });

    for (let index = 0; index < 5; index += 1) {
      const admission = gate.tryAcquire({
        userId: firstUser,
        hostname: `${index}.example`,
      });
      expect(admission.ok).toBe(true);
      if (admission.ok) admission.permit.release();
    }
    expect(
      gate.tryAcquire({ userId: firstUser, hostname: "limited.example" }),
    ).toEqual({ ok: false, error: "rate_limited" });

    nowMs += 3_000;
    const refilled = gate.tryAcquire({
      userId: firstUser,
      hostname: "refilled.example",
    });
    expect(refilled.ok).toBe(true);
    if (refilled.ok) refilled.permit.release();
  });

  it("releases each permit once after completion", () => {
    const gate = createSourceInspectionAdmissionGate();
    const first = gate.tryAcquire({
      userId: firstUser,
      hostname: "shared.example",
    });
    const second = gate.tryAcquire({
      userId: secondUser,
      hostname: "shared.example",
    });
    if (!first.ok || !second.ok) throw new Error("Expected two permits");

    first.permit.release();
    first.permit.release();
    const replacement = gate.tryAcquire({
      userId: firstUser,
      hostname: "shared.example",
    });

    expect(replacement.ok).toBe(true);
    second.permit.release();
    if (replacement.ok) replacement.permit.release();
  });

  it("moves the host lease at a redirect without retaining the prior host", () => {
    const gate = createSourceInspectionAdmissionGate();
    const moving = gate.tryAcquire({
      userId: firstUser,
      hostname: "first.example",
    });
    const target = gate.tryAcquire({
      userId: secondUser,
      hostname: "target.example",
    });
    if (!moving.ok || !target.ok) throw new Error("Expected permits");

    expect(moving.permit.tryMoveToHostname("target.example")).toBe(true);
    expect(
      gate.tryAcquire({
        userId: "77a58cf6-a808-4a60-ad1f-6a82dec7df95" as UserId,
        hostname: "target.example",
      }),
    ).toEqual({ ok: false, error: "overload" });
    const priorHost = gate.tryAcquire({
      userId: "77a58cf6-a808-4a60-ad1f-6a82dec7df95" as UserId,
      hostname: "first.example",
    });
    expect(priorHost.ok).toBe(true);

    moving.permit.release();
    target.permit.release();
    if (priorHost.ok) priorHost.permit.release();
  });
});

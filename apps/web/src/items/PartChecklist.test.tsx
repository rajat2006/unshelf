// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Status,
  StatusMode,
  Type,
  type ItemDetail,
  type ItemId,
  type PartId,
  type UserId,
} from "@unshelf/shared";
import { createParts, updatePart, updatePartCompletion } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { PartChecklist } from "./PartChecklist";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  createParts: vi.fn(),
  updatePart: vi.fn(),
  updatePartCompletion: vi.fn(),
}));

const itemId = "00000000-0000-0000-0000-000000000001" as ItemId;
const item: ItemDetail = {
  id: itemId,
  userId: "00000000-0000-0000-0000-000000000002" as UserId,
  title: "Distributed systems course",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Course,
  status: Status.InProgress,
  statusMode: StatusMode.Automatic,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: 0,
  parts: [
    {
      id: "00000000-0000-0000-0000-000000000003" as PartId,
      itemId,
      title: "Foundations",
      position: 0,
      completed: false,
    },
  ],
};
const user: CurrentUser = { getToken: async () => null };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Part checklist", () => {
  it("explains invalid multiline input beside the field", () => {
    render(<PartChecklist item={item} user={user} onChanged={vi.fn()} />);

    const form = screen.getByLabelText("New Part titles").closest("form")!;
    fireEvent.change(screen.getByLabelText("New Part titles"), {
      target: { value: "  \n " },
    });
    fireEvent.submit(form);

    expect(screen.getByText("Enter at least one Part title.")).toBeVisible();
    expect(createParts).not.toHaveBeenCalled();
  });

  it("keeps multiline titles available when adding Parts fails", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.mocked(createParts).mockReturnValue(
      new Promise((_, reject) => {
        rejectRequest = reject;
      }),
    );
    render(<PartChecklist item={item} user={user} onChanged={vi.fn()} />);

    const field = screen.getByLabelText("New Part titles");
    fireEvent.change(field, { target: { value: "Storage\nReplication" } });
    fireEvent.submit(field.closest("form")!);

    expect(
      screen.getByRole("button", { name: "Adding Parts…" }),
    ).toBeDisabled();
    rejectRequest(new Error("api responded 503"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t add Parts. Your titles are still here.",
    );
    expect(field).toHaveValue("Storage\nReplication");
  });

  it("keeps an edited Part title when rename fails", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.mocked(updatePart).mockReturnValue(
      new Promise((_, reject) => {
        rejectRequest = reject;
      }),
    );
    render(<PartChecklist item={item} user={user} onChanged={vi.fn()} />);

    const title = screen.getByLabelText("Title for Foundations");
    fireEvent.change(title, { target: { value: "Core concepts" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Core concepts" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Updating Foundations…",
    );
    rejectRequest(new Error("api responded 409"));

    await waitFor(() => expect(updatePart).toHaveBeenCalled());
    expect(title).toHaveValue("Core concepts");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t rename Foundations. Your edit is still here.",
    );
  });

  it("explains an empty Part rename beside the field", () => {
    render(<PartChecklist item={item} user={user} onChanged={vi.fn()} />);

    const title = screen.getByLabelText("Title for Foundations");
    fireEvent.change(title, { target: { value: "   " } });

    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a Part title.")).toBeVisible();
    expect(updatePart).not.toHaveBeenCalled();
  });

  it("checks off a Part through the catalogue completion control", async () => {
    vi.mocked(updatePartCompletion).mockResolvedValue({
      ...item,
      parts: [{ ...item.parts[0], completed: true }],
      partPercentage: 100,
    });
    const onChanged = vi.fn();
    render(<PartChecklist item={item} user={user} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Foundations" }));

    await waitFor(() =>
      expect(updatePartCompletion).toHaveBeenCalledWith(
        user,
        item.id,
        item.parts[0].id,
        true,
      ),
    );
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ partPercentage: 100 }),
    );
  });
});

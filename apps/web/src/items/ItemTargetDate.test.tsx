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
  type Item,
  type ItemId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { updateItemTargetDate } from "../api";
import { ItemTargetDate } from "./ItemTargetDate";

vi.mock("../api", () => ({ updateItemTargetDate: vi.fn() }));

const user: CurrentUser = { getToken: async () => null };
const item: Item = {
  id: "00000000-0000-0000-0000-000000000001" as ItemId,
  userId: "00000000-0000-0000-0000-000000000002" as UserId,
  title: "Practical indexing",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Course,
  status: Status.InProgress,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};

afterEach(() => {
  cleanup();
  vi.mocked(updateItemTargetDate).mockReset();
});

describe("Item Target date editor", () => {
  it("keeps a failed soft date local and offers an explicit retry", async () => {
    const changed = { ...item, targetDate: "2026-09-01" };
    const onChanged = vi.fn();
    vi.mocked(updateItemTargetDate)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockResolvedValueOnce(changed);
    render(<ItemTargetDate item={item} user={user} onChanged={onChanged} />);

    fireEvent.change(
      screen.getByLabelText("Target date for Practical indexing"),
      {
        target: { value: "2026-09-01" },
      },
    );

    expect(
      await screen.findByText(
        "Couldn’t update Target date. Your previous date is unchanged.",
      ),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Target date for Practical indexing"),
    ).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Retry Target date" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(changed));
    expect(updateItemTargetDate).toHaveBeenCalledTimes(2);
    expect(updateItemTargetDate).toHaveBeenLastCalledWith(
      user,
      item.id,
      "2026-09-01",
    );
  });
});

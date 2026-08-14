// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { updateItemStatus } from "../api";
import { ItemStatusSelect } from "./ItemStatusSelect";

vi.mock("../api", () => ({ updateItemStatus: vi.fn() }));

const user: CurrentUser = { getToken: async () => null };
const item: Item = {
  id: "00000000-0000-0000-0000-000000000001" as ItemId,
  userId: "00000000-0000-0000-0000-000000000002" as UserId,
  title: "Practical indexing",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Course,
  status: Status.NotStarted,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.mocked(updateItemStatus).mockReset();
});

describe("compact Item Status editor", () => {
  it("uses the shared Status names and publishes the changed Item", async () => {
    const changed = { ...item, status: Status.Done };
    const onChanged = vi.fn();
    vi.mocked(updateItemStatus).mockResolvedValue(changed);
    render(<ItemStatusSelect item={item} user={user} onChanged={onChanged} />);

    fireEvent.click(
      screen.getByRole("combobox", { name: "Status for Practical indexing" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Done" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(changed));
    expect(updateItemStatus).toHaveBeenCalledWith(user, item.id, Status.Done);
  });

  it("keeps a failed change local and retries the same Status", async () => {
    const changed = { ...item, status: Status.InProgress };
    const onChanged = vi.fn();
    vi.mocked(updateItemStatus)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockResolvedValueOnce(changed);
    render(<ItemStatusSelect item={item} user={user} onChanged={onChanged} />);

    fireEvent.click(
      screen.getByRole("combobox", { name: "Status for Practical indexing" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "In progress" }));

    expect(
      await screen.findByText(
        "Couldn’t update Status. Your previous Status is unchanged.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry Status" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(changed));
    expect(updateItemStatus).toHaveBeenCalledTimes(2);
  });
});

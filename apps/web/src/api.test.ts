import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemId } from "@unshelf/shared";
import type { CurrentUser } from "./application-auth/types";
import { deleteItem, fetchItem, ItemRequestError } from "./api";

const itemId = "00000000-0000-0000-0000-000000000001" as ItemId;
const user: CurrentUser = { getToken: async () => "test-token" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Item client", () => {
  it("deletes an Item with a bodyless request and returns no value", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    await expect(deleteItem(user, itemId)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      `/api/items/${itemId}`,
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(
      (request.mock.calls[0]?.[1] as RequestInit).headers,
    ).toHaveProperty("get");
    expect(
      ((request.mock.calls[0]?.[1] as RequestInit).headers as Headers).get(
        "Authorization",
      ),
    ).toBe("Bearer test-token");
  });

  it.each([fetchItem, deleteItem])(
    "distinguishes an unavailable Item from a temporary failure",
    async (requestItem) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(null, { status: 404 }))
          .mockRejectedValueOnce(new TypeError("network interrupted")),
      );

      await expect(requestItem(user, itemId)).rejects.toMatchObject({
        kind: "not_found",
      } satisfies Partial<ItemRequestError>);
      await expect(requestItem(user, itemId)).rejects.toMatchObject({
        kind: "temporary",
      } satisfies Partial<ItemRequestError>);
    },
  );
});

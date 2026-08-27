import { EventEmitter } from "node:events";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { stopTestPostgres, trackTestPool } from "./postgres-lifecycle";

describe("PostgreSQL test lifecycle", () => {
  it("keeps PostgreSQL running until every pool client socket ends", async () => {
    const rawPool = new Pool();
    const client = new EventEmitter();
    const pool = trackTestPool(rawPool);
    rawPool.emit("connect", client);
    const end = vi.spyOn(rawPool, "end").mockResolvedValue();
    const stop = vi.fn().mockResolvedValue(undefined);
    const container = { stop };

    const stopping = stopTestPostgres({ pool, container });
    await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
    expect(stop).not.toHaveBeenCalled();

    client.emit("end");
    await stopping;

    expect(stop).toHaveBeenCalledWith({ timeout: 10_000 });
  });

  it("still stops PostgreSQL when closing the pool fails", async () => {
    const failure = new Error("pool close failed");
    const pool = { close: vi.fn().mockRejectedValue(failure) };
    const stop = vi.fn().mockResolvedValue(undefined);
    const container = { stop };

    await expect(stopTestPostgres({ pool, container })).rejects.toBe(failure);
    expect(stop).toHaveBeenCalledWith({ timeout: 10_000 });
  });
});

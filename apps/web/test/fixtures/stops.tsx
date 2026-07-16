import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Status,
  Type,
  type Item,
  type ItemId,
  type Stop,
  type StopDetail,
  type StopId,
  type UserId,
} from "@unshelf/shared";
import { ResponsiveAppShell } from "../../src/ResponsiveAppShell";
import type { CurrentUser } from "../../src/auth";
import { StopsSection } from "../../src/stops/StopsSection";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const stopId = "00000000-0000-0000-0000-000000000002" as StopId;

const user: CurrentUser = {
  getToken: async () => null,
};

const stops: Stop[] = [
  { id: stopId, userId, name: "Learn CSS" },
  {
    id: "00000000-0000-0000-0000-000000000003" as StopId,
    userId,
    name: "Build the API",
  },
];

const item: Item = {
  id: "00000000-0000-0000-0000-000000000004" as ItemId,
  userId,
  title: "A deliberately long responsive-layout title that still fits",
  source: "https://example.com/a/deliberately/long/source/that/must/wrap/on/a/phone",
  type: Type.Article,
  status: Status.InProgress,
  targetDate: "2026-08-01",
  pastTarget: false,
  completedAt: null,
};

const openStop: StopDetail | null =
  new URLSearchParams(window.location.search).get("view") === "detail"
    ? { ...stops[0]!, items: [item] }
    : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResponsiveAppShell>
      <StopsSection
        stops={stops}
        openStop={openStop}
        error={null}
        user={user}
        onStopsChanged={async () => undefined}
        onStopOpened={() => undefined}
        onStopChanged={() => undefined}
        onItemChanged={() => undefined}
      />
    </ResponsiveAppShell>
  </StrictMode>,
);

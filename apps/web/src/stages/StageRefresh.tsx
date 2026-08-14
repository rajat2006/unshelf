import { useState, type ReactNode } from "react";
import type { StageDetail, StageId } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fetchStage } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface StageRefreshOptions {
  stageId: StageId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}

/** Reconcile a successful placement mutation without recasting refresh failure as mutation failure. */
export function useStageRefresh({
  stageId,
  user,
  onStageChanged,
}: StageRefreshOptions) {
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refreshStage = async () => {
    setRefreshFailed(false);
    try {
      onStageChanged(await fetchStage(user, stageId));
    } catch {
      setRefreshFailed(true);
    }
  };

  return { refreshStage, refreshFailed };
}

export function StageRefreshFailure({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry: () => Promise<void>;
}) {
  return (
    <Alert className="grid justify-items-start gap-2">
      <span>{children}</span>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        onClick={() => void onRetry()}
      >
        Retry Stage refresh
      </Button>
    </Alert>
  );
}

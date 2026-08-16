import type { DiscoverModule, ProviderPurgeReport } from "./discover/module";
import { serializeFailure } from "./diagnostics";
import type { Logger } from "./logging";

export type DiscoverMaintenanceCommand =
  | {
      kind: "expire_due";
      dryRun: boolean;
      batchSize: number;
    }
  | {
      kind: "complete";
      provider: "youtube";
      batchSize: number;
    };

type DiscoverMaintenanceFacade = Pick<DiscoverModule, "purgeProviderData">;

export class ReportedDiscoverMaintenanceFailure extends Error {}

export function parseDiscoverMaintenanceCommand(
  arguments_: readonly string[],
): DiscoverMaintenanceCommand {
  const mode = arguments_[0];
  if (mode === "complete-youtube-purge") {
    const { flags, batchSize } = parseOptions({
      arguments_,
      flags: ["--execute", "--confirm-suspension-termination"],
    });
    if (
      !flags.has("--execute") ||
      !flags.has("--confirm-suspension-termination")
    ) {
      throw new Error(
        "complete YouTube purge requires --execute and --confirm-suspension-termination",
      );
    }
    return { kind: "complete", provider: "youtube", batchSize };
  }
  if (mode !== "expire-due") {
    throw new Error(
      "Maintenance mode must be expire-due or complete-youtube-purge",
    );
  }
  const { flags, batchSize } = parseOptions({
    arguments_,
    flags: ["--dry-run", "--execute"],
  });
  const dryRun = flags.has("--dry-run");
  const execute = flags.has("--execute");
  if (dryRun === execute) {
    throw new Error(
      "expire-due requires exactly one of --dry-run or --execute",
    );
  }
  return { kind: "expire_due", dryRun, batchSize };
}

function parseOptions({
  arguments_,
  flags: acceptedFlags,
}: {
  arguments_: readonly string[];
  flags: readonly string[];
}): { flags: ReadonlySet<string>; batchSize: number } {
  const flags = new Set<string>();
  let batchSize = 100;
  let hasBatchSize = false;
  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--batch-size") {
      if (hasBatchSize) throw new Error("--batch-size may be provided once");
      hasBatchSize = true;
      batchSize = Number(arguments_[index + 1]);
      index += 1;
      continue;
    }
    if (argument === undefined || !acceptedFlags.includes(argument)) {
      throw new Error(`Unknown maintenance argument: ${argument ?? ""}`);
    }
    if (flags.has(argument)) {
      throw new Error(`${argument} may be provided once`);
    }
    flags.add(argument);
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("--batch-size must be an integer from 1 to 1000");
  }
  return { flags, batchSize };
}

export async function runDiscoverMaintenance({
  command,
  discover,
  logger,
  monotonicNow = () => performance.now(),
  diagnosticSecrets,
}: {
  command: DiscoverMaintenanceCommand;
  discover: DiscoverMaintenanceFacade;
  logger: Logger;
  monotonicNow?: () => number;
  diagnosticSecrets?: readonly string[];
}): Promise<ProviderPurgeReport> {
  const startedAt = monotonicNow();
  logger.info({
    event: "unshelf.discover.maintenance.started",
    msg: "Discover maintenance started",
    ...command,
  });
  let report: ProviderPurgeReport;
  try {
    report = await discover.purgeProviderData(command);
  } catch (failure) {
    logger.fatal({
      event: "unshelf.discover.maintenance.failed",
      msg: "Discover maintenance failed",
      kind: command.kind,
      ...serializeFailure(failure, { secrets: diagnosticSecrets }),
    });
    try {
      await logger.flush();
    } catch {
      // Preserve the maintenance failure if reporting cannot flush.
    }
    throw new ReportedDiscoverMaintenanceFailure(
      "Discover maintenance failed",
      { cause: failure },
    );
  }
  const durationMs = monotonicNow() - startedAt;
  if (report.failedOperations > 0) {
    logger.error({
      event: "unshelf.discover.maintenance.failed",
      msg: "Discover maintenance completed with failed work",
      ...report,
      durationMs,
    });
    await logger.flush();
    throw new ReportedDiscoverMaintenanceFailure(
      "Discover maintenance completed with failed work",
    );
  }
  logger.info({
    event: "unshelf.discover.maintenance.completed",
    msg: "Discover maintenance completed",
    ...report,
    durationMs,
  });
  await logger.flush();
  return report;
}

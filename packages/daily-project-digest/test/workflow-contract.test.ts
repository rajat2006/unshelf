import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL(
    "../../../.github/workflows/daily-project-digest.yml",
    import.meta.url,
  ),
  "utf8",
);

describe("Daily Project Digest workflow", () => {
  it("offers commissioned manual runs and gated nightly delivery", () => {
    expect(workflow).toContain('cron: "0 23 * * *"');
    expect(workflow).toContain('timezone: "Asia/Kolkata"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("options: [preview, deliver]");
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' || vars.DAILY_DIGEST_SCHEDULE_ENABLED == 'true'",
    );
    expect(workflow).toContain(
      "github.event_name == 'schedule' || inputs.mode == 'deliver'",
    );
  });

  it("keeps credentials behind least-privilege trusted boundaries", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("deployments: read");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("issues: read");
    expect(workflow).toContain("environment: daily-project-digest");
    expect(workflow).not.toContain("AGENT_PAT");
    expect(
      workflow.match(/DAILY_DIGEST_DISCORD_WEBHOOK_URL: \$\{\{/g),
    ).toHaveLength(1);
  });

  it("records sanitized delivery outcomes for operators", () => {
    expect(workflow).toContain("Record sanitized delivery success");
    expect(workflow).toContain("Discord accepted the digest.");
    expect(workflow).toContain("Record sanitized failure");
    expect(workflow).toContain(
      "No credentials or provider responses were recorded.",
    );
  });
});

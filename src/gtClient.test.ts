import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode before importing anything that depends on it
vi.mock("vscode", () => {
  class ThemeColor {
    constructor(public id: string) {}
  }
  return {
    workspace: {
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
      }),
    },
    ThemeColor,
  };
});

// Mock child_process (used by requireChildProcess())
vi.mock("child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

/**
 * Shared mock state for ProcessSupervisor — allows per-test overrides
 * of execute() behavior while keeping the constructor mock stable.
 */
let mockSupervisorExecute = vi.fn().mockResolvedValue({ success: true, data: null });
const mockSupervisorDestroy = vi.fn();

vi.mock("./cli/processSupervisor", () => ({
  ProcessSupervisor: class MockProcessSupervisor {
    execute = mockSupervisorExecute;
    destroy = mockSupervisorDestroy;
  },
}));

import { GtClient, doltPortLabel, type DaemonHealth } from "./gtClient";

/**
 * Access private static methods for testing pure business logic.
 * These are stateless functions with no side effects.
 */
const deriveDisplayStatus = (GtClient as any).deriveDisplayStatus.bind(GtClient);
const normalizeRole = (GtClient as any).normalizeRole.bind(GtClient);
const inferRole = (GtClient as any).inferRole.bind(GtClient);
const deriveTask = (GtClient as any).deriveTask.bind(GtClient);

describe("GtClient", () => {
  describe("deriveDisplayStatus()", () => {
    describe("state-based overrides (highest priority)", () => {
      it("returns 'dead' when state is 'dead', regardless of running/hasWork", () => {
        expect(deriveDisplayStatus(true, true, "dead")).toBe("dead");
        expect(deriveDisplayStatus(false, false, "dead")).toBe("dead");
        expect(deriveDisplayStatus(true, false, "dead")).toBe("dead");
        expect(deriveDisplayStatus(false, true, "dead")).toBe("dead");
      });

      it("returns 'stuck' when state is 'stuck'", () => {
        expect(deriveDisplayStatus(true, true, "stuck")).toBe("stuck");
        expect(deriveDisplayStatus(false, false, "stuck")).toBe("stuck");
      });

      it("returns 'completing' when state is 'done'", () => {
        expect(deriveDisplayStatus(true, true, "done")).toBe("completing");
        expect(deriveDisplayStatus(false, false, "done")).toBe("completing");
      });

      it("returns 'running' when state is 'working'", () => {
        expect(deriveDisplayStatus(true, false, "working")).toBe("running");
        expect(deriveDisplayStatus(false, true, "working")).toBe("running");
      });
    });

    describe("fallback when no recognized state", () => {
      it("returns 'exited' when not running (no state)", () => {
        expect(deriveDisplayStatus(false, false)).toBe("exited");
        expect(deriveDisplayStatus(false, true)).toBe("exited");
        expect(deriveDisplayStatus(false, false, undefined)).toBe("exited");
      });

      it("returns 'running' when running and has work", () => {
        expect(deriveDisplayStatus(true, true)).toBe("running");
        expect(deriveDisplayStatus(true, true, undefined)).toBe("running");
      });

      it("returns 'idle' when running but no work", () => {
        expect(deriveDisplayStatus(true, false)).toBe("idle");
        expect(deriveDisplayStatus(true, false, undefined)).toBe("idle");
      });

      it("ignores unrecognized state strings", () => {
        expect(deriveDisplayStatus(true, false, "bogus")).toBe("idle");
        expect(deriveDisplayStatus(true, true, "bogus")).toBe("running");
        expect(deriveDisplayStatus(false, false, "bogus")).toBe("exited");
      });
    });

    describe("priority ordering", () => {
      it("dead > stuck > done > working > !running > hasWork > idle", () => {
        expect(deriveDisplayStatus(true, true, "dead")).toBe("dead");
        expect(deriveDisplayStatus(true, true, "stuck")).toBe("stuck");
        expect(deriveDisplayStatus(true, true, "done")).toBe("completing");
        expect(deriveDisplayStatus(true, true, "working")).toBe("running");
        expect(deriveDisplayStatus(false, true, undefined)).toBe("exited");
        expect(deriveDisplayStatus(true, true, undefined)).toBe("running");
        expect(deriveDisplayStatus(true, false, undefined)).toBe("idle");
      });
    });
  });

  describe("normalizeRole()", () => {
    it("maps 'coordinator' to 'mayor'", () => {
      expect(normalizeRole("coordinator")).toBe("mayor");
    });

    it("maps 'health-check' to 'deacon'", () => {
      expect(normalizeRole("health-check")).toBe("deacon");
    });

    it("passes through unknown roles unchanged", () => {
      expect(normalizeRole("polecat")).toBe("polecat");
      expect(normalizeRole("witness")).toBe("witness");
      expect(normalizeRole("refinery")).toBe("refinery");
      expect(normalizeRole("mayor")).toBe("mayor");
      expect(normalizeRole("dog")).toBe("dog");
    });

    it("passes through arbitrary strings unchanged", () => {
      expect(normalizeRole("unknown-role")).toBe("unknown-role");
      expect(normalizeRole("")).toBe("");
    });

    it("is case-sensitive (no automatic lowering)", () => {
      expect(normalizeRole("Coordinator")).toBe("Coordinator");
      expect(normalizeRole("COORDINATOR")).toBe("COORDINATOR");
    });
  });

  describe("inferRole()", () => {
    describe("emoji parameter takes priority", () => {
      it("maps hat emoji to mayor", () => {
        expect(inferRole("anything", "🎩")).toBe("mayor");
      });

      it("maps wolf emoji to deacon", () => {
        expect(inferRole("anything", "🐺")).toBe("deacon");
      });

      it("maps construction worker emoji to polecat", () => {
        expect(inferRole("anything", "👷")).toBe("polecat");
      });

      it("maps cat emoji to polecat", () => {
        expect(inferRole("anything", "🐱")).toBe("polecat");
      });
    });

    describe("name-as-emoji fallback", () => {
      it("treats name as emoji if it matches EMOJI_ROLE_MAP", () => {
        expect(inferRole("🎩")).toBe("mayor");
        expect(inferRole("🐺")).toBe("deacon");
        expect(inferRole("👷")).toBe("polecat");
        expect(inferRole("🐱")).toBe("polecat");
      });
    });

    describe("name-based role lookup", () => {
      it("maps known role names via ROLE_MAP", () => {
        expect(inferRole("mayor")).toBe("mayor");
        expect(inferRole("deacon")).toBe("deacon");
        expect(inferRole("witness")).toBe("witness");
        expect(inferRole("refinery")).toBe("refinery");
        expect(inferRole("dog")).toBe("dog");
      });

      it("lowercases name before lookup", () => {
        expect(inferRole("Mayor")).toBe("mayor");
        expect(inferRole("WITNESS")).toBe("witness");
        expect(inferRole("Refinery")).toBe("refinery");
      });
    });

    describe("default fallback", () => {
      it("defaults to 'polecat' for unknown names", () => {
        expect(inferRole("nux")).toBe("polecat");
        expect(inferRole("rictus")).toBe("polecat");
        expect(inferRole("some-random-agent")).toBe("polecat");
      });

      it("defaults to 'polecat' with unknown emoji", () => {
        expect(inferRole("nux", "🔥")).toBe("polecat");
      });
    });

    describe("priority order", () => {
      it("emoji parameter > name emoji > name role > default", () => {
        // Emoji param overrides name-based lookup
        expect(inferRole("mayor", "🐺")).toBe("deacon");
        // Name emoji overrides role map
        expect(inferRole("🎩")).toBe("mayor");
        // Role map name before default
        expect(inferRole("witness")).toBe("witness");
        // Default
        expect(inferRole("xyz")).toBe("polecat");
      });
    });
  });

  describe("deriveTask()", () => {
    it("returns bead_id task when hook has bead_id", () => {
      expect(deriveTask({ has_work: true }, { bead_id: "ct-123" })).toBe("Working on ct-123");
    });

    it("returns first_subject when no hook bead_id", () => {
      expect(deriveTask({ has_work: true, first_subject: "Fix bug" })).toBe("Fix bug");
    });

    it("returns 'Processing work' when has_work but no subject", () => {
      expect(deriveTask({ has_work: true })).toBe("Processing work");
    });

    it("returns 'Not running' when agent not running", () => {
      expect(deriveTask({ running: false })).toBe("Not running");
    });

    it("returns undefined when no work and running", () => {
      expect(deriveTask({ running: true })).toBeUndefined();
      expect(deriveTask({})).toBeUndefined();
    });

    it("prefers hook bead_id over first_subject", () => {
      expect(
        deriveTask(
          { has_work: true, first_subject: "Some subject" },
          { bead_id: "ct-999", has_work: true },
        ),
      ).toBe("Working on ct-999");
    });

    it("prefers first_subject over generic 'Processing work'", () => {
      expect(
        deriveTask({ has_work: true, first_subject: "Specific task" }),
      ).toBe("Specific task");
    });
  });

  describe("getDaemonIssues()", () => {
    let client: GtClient;

    beforeEach(() => {
      client = new GtClient();
    });

    afterEach(() => {
      client.dispose();
    });

    it("returns empty array for healthy daemon", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: false,
        crashLoops: [],
        staleAgentConfig: false,
      };
      expect(client.getDaemonIssues(health)).toEqual([]);
    });

    it("detects not-running issue", () => {
      const health: DaemonHealth = {
        running: false,
        staleHeartbeat: false,
        crashLoops: [],
        staleAgentConfig: false,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([{ kind: "not-running" }]);
    });

    it("detects stale-heartbeat issue", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: true,
        heartbeatAge: "15m",
        crashLoops: [],
        staleAgentConfig: false,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([{ kind: "stale-heartbeat", age: "15m" }]);
    });

    it("skips stale-heartbeat when heartbeatAge is missing", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: true,
        crashLoops: [],
        staleAgentConfig: false,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([]);
    });

    it("detects single crash-loop issue", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: false,
        crashLoops: [
          { agent: "nux", since: "2026-02-25T10:00:00Z", restartCount: 5 },
        ],
        staleAgentConfig: false,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([
        { kind: "crash-loop", agent: "nux", since: "2026-02-25T10:00:00Z", restartCount: 5 },
      ]);
    });

    it("detects multiple crash-loop issues", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: false,
        crashLoops: [
          { agent: "nux", since: "2026-02-25T10:00:00Z", restartCount: 3 },
          { agent: "rictus", since: "2026-02-25T11:00:00Z", restartCount: 7 },
        ],
        staleAgentConfig: false,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        kind: "crash-loop",
        agent: "nux",
        since: "2026-02-25T10:00:00Z",
        restartCount: 3,
      });
      expect(issues[1]).toEqual({
        kind: "crash-loop",
        agent: "rictus",
        since: "2026-02-25T11:00:00Z",
        restartCount: 7,
      });
    });

    it("detects stale-agent-config issue", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: false,
        crashLoops: [],
        staleAgentConfig: true,
        staleAgentCommand: "/old/path/to/claude",
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([
        { kind: "stale-agent-config", command: "/old/path/to/claude" },
      ]);
    });

    it("skips stale-agent-config when staleAgentCommand is missing", () => {
      const health: DaemonHealth = {
        running: true,
        staleHeartbeat: false,
        crashLoops: [],
        staleAgentConfig: true,
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toEqual([]);
    });

    it("detects all issue types simultaneously", () => {
      const health: DaemonHealth = {
        running: false,
        staleHeartbeat: true,
        heartbeatAge: "2h30m",
        crashLoops: [
          { agent: "nux", since: "2026-02-25T10:00:00Z", restartCount: 10 },
        ],
        staleAgentConfig: true,
        staleAgentCommand: "/bad/path",
      };
      const issues = client.getDaemonIssues(health);
      expect(issues).toHaveLength(4);
      expect(issues[0]).toEqual({ kind: "not-running" });
      expect(issues[1]).toEqual({ kind: "stale-heartbeat", age: "2h30m" });
      expect(issues[2]).toEqual({
        kind: "crash-loop",
        agent: "nux",
        since: "2026-02-25T10:00:00Z",
        restartCount: 10,
      });
      expect(issues[3]).toEqual({ kind: "stale-agent-config", command: "/bad/path" });
    });

    it("preserves issue ordering: not-running, stale-heartbeat, crash-loops, stale-config", () => {
      const health: DaemonHealth = {
        running: false,
        staleHeartbeat: true,
        heartbeatAge: "5m",
        crashLoops: [
          { agent: "a", since: "t1", restartCount: 1 },
          { agent: "b", since: "t2", restartCount: 2 },
        ],
        staleAgentConfig: true,
        staleAgentCommand: "/x",
      };
      const kinds = client.getDaemonIssues(health).map((i) => i.kind);
      expect(kinds).toEqual([
        "not-running",
        "stale-heartbeat",
        "crash-loop",
        "crash-loop",
        "stale-agent-config",
      ]);
    });
  });

  describe("isInfrastructureRole()", () => {
    it("returns true for infrastructure roles", () => {
      expect(GtClient.isInfrastructureRole("mayor")).toBe(true);
      expect(GtClient.isInfrastructureRole("deacon")).toBe(true);
      expect(GtClient.isInfrastructureRole("witness")).toBe(true);
      expect(GtClient.isInfrastructureRole("refinery")).toBe(true);
      expect(GtClient.isInfrastructureRole("dog")).toBe(true);
      expect(GtClient.isInfrastructureRole("coordinator")).toBe(true);
      expect(GtClient.isInfrastructureRole("health-check")).toBe(true);
    });

    it("returns false for non-infrastructure roles", () => {
      expect(GtClient.isInfrastructureRole("polecat")).toBe(false);
      expect(GtClient.isInfrastructureRole("crew")).toBe(false);
      expect(GtClient.isInfrastructureRole("unknown")).toBe(false);
    });
  });

  describe("doltPortLabel()", () => {
    it("labels port 3306 as 'bd'", () => {
      expect(doltPortLabel(3306)).toBe("bd");
    });

    it("labels port 3307 as 'gt'", () => {
      expect(doltPortLabel(3307)).toBe("gt");
    });

    it("labels unknown ports as string number", () => {
      expect(doltPortLabel(8080)).toBe("8080");
      expect(doltPortLabel(0)).toBe("0");
    });
  });

  describe("getAgents() cascade", () => {
    let client: GtClient;

    beforeEach(() => {
      mockSupervisorExecute = vi.fn();
      client = new GtClient();
    });

    afterEach(() => {
      client.dispose();
    });

    it("maps status JSON agents with role normalization and display status", async () => {
      const statusData = {
        agents: [
          { name: "overseer", role: "coordinator", running: true, has_work: false },
        ],
        rigs: [],
      };
      // First call: cachedExec(['status', '--json']) via supervisor
      // Second call: cachedExec(['polecat', 'list', '--all', '--json'])
      mockSupervisorExecute
        .mockResolvedValueOnce({ success: true, data: statusData })
        .mockResolvedValueOnce({ success: true, data: [] });

      const agents = await client.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("overseer");
      expect(agents[0].role).toBe("mayor");
      expect(agents[0].displayStatus).toBe("idle");
    });

    it("falls back to list-based approach when status returns empty", async () => {
      mockSupervisorExecute
        .mockResolvedValueOnce({ success: true, data: { agents: [], rigs: [] } })
        .mockResolvedValueOnce({ success: true, data: [] })
        .mockResolvedValueOnce({
          success: true,
          data: [
            { name: "nux", role: "polecat", status: "working", rig: "citadel" },
          ],
        });

      const agents = await client.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("nux");
      expect(agents[0].hasWork).toBe(true);
    });

    it("falls back to text parsing when both JSON approaches fail", async () => {
      // getAgentsFromStatus: exec(['status', '--json']) fails
      mockSupervisorExecute
        .mockResolvedValueOnce({ success: false, error: "fail" })
        .mockResolvedValueOnce({ success: true, data: [] })
        // getAgentsFromList: exec(['agents', 'list', '-a']) fails
        .mockResolvedValueOnce({ success: false, error: "fail" })
        // getAgentsFromTextFallback: exec(['agents', 'list', '-a']) returns text
        .mockResolvedValueOnce({
          success: true,
          data: "🎩 mayor active citadel\n👷 nux working citadel",
        });

      const agents = await client.getAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe("mayor");
      expect(agents[0].role).toBe("mayor");
      expect(agents[1].name).toBe("nux");
      expect(agents[1].role).toBe("polecat");
      expect(agents[1].hasWork).toBe(true);
    });

    it("returns empty array when all fallbacks fail", async () => {
      mockSupervisorExecute.mockResolvedValue({ success: false, error: "fail" });

      const agents = await client.getAgents();
      expect(agents).toEqual([]);
    });
  });
});

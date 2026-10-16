import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeSketchForgeMcpCommand,
  dispatchSketchForgeMcpCommand,
  pollSketchForgeMcpCommand,
  registerSketchForgeMcpEditor,
  waitForSketchForgeMcpCommand,
} from "@/lib/sketchforgeMcpStore";

afterEach(() => {
  vi.useRealTimers();
});

function registerEditor(editorId: string) {
  registerSketchForgeMcpEditor({
    editorId,
    editorNumber: 1,
    projectId: null,
    projectName: "Test",
    url: "http://localhost",
    focused: true,
    shapeCount: 1,
    selectedCount: 1,
    notice: "",
    lastError: null,
  });
}

describe("SketchForge MCP command deadlines", () => {
  it("includes the bounded deadline in a command delivered to the editor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    registerEditor("deadline-editor");
    const resultPromise = dispatchSketchForgeMcpCommand({
      editorId: "deadline-editor",
      action: "apply_edge_treatment",
      timeoutMs: 5_000,
    });

    const command = pollSketchForgeMcpCommand("deadline-editor");
    expect(command?.createdAt).toBe(10_000);
    expect(command?.expiresAt).toBe(15_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await resultPromise;
  });

  it("does not deliver a queued command after its caller timed out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    registerEditor("expired-editor");
    const resultPromise = dispatchSketchForgeMcpCommand({
      editorId: "expired-editor",
      action: "apply_edge_treatment",
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(pollSketchForgeMcpCommand("expired-editor")).toBeNull();
  });
});

const editor = {
  editorId: "editor-test",
  editorNumber: 12345,
  projectId: "project-test",
  projectName: "MCP test",
  url: "http://localhost:3000/?editor=1",
  focused: true,
  shapeCount: 0,
  selectedCount: 0,
  notice: "",
  lastError: null,
};

beforeEach(() => {
  delete (globalThis as { __sketchforgeMcpStore?: unknown }).__sketchforgeMcpStore;
  registerSketchForgeMcpEditor(editor);
});

describe("SketchForge MCP long polling", () => {
  it("delivers a command directly to a waiting editor", async () => {
    const poll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });
    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "list_objects" });

    const command = await poll;
    expect(command).toMatchObject({ action: "list_objects", params: {} });
    expect(pollSketchForgeMcpCommand(editor.editorId)).toBeNull();

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true, data: [] });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true, data: [] });
  });

  it("allows only one pending poll per editor", async () => {
    const firstPoll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });
    const secondPoll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });

    await expect(firstPoll).resolves.toBeNull();
    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "inspect_errors" });
    const command = await secondPoll;
    expect(command?.action).toBe("inspect_errors");

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true });
  });

  it("removes an aborted poll before queueing the next command", async () => {
    const controller = new AbortController();
    const poll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await expect(poll).resolves.toBeNull();

    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "get_scene" });
    const command = pollSketchForgeMcpCommand(editor.editorId);
    expect(command?.action).toBe("get_scene");

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true });
  });
});

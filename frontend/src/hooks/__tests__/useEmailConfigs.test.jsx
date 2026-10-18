import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../api", () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import api from "../../api";
import toast from "../../toast";
import useEmailConfigs from "../useEmailConfigs";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONFIG_A = {
  id: 1, label: "RFI Inbox", provider: "gmail", provider_display: "Gmail",
  username: "rfi@example.com", mailbox: "INBOX", is_active: true,
  auto_create_threshold: 0.85, subject_format_hint: "", last_polled_at: null,
  gmail_primary_only: true,
};

const CONFIG_B = {
  id: 2, label: "Archive Inbox", provider: "outlook", provider_display: "Outlook",
  username: "archive@example.com", mailbox: "INBOX", is_active: false,
  auto_create_threshold: 0.70, subject_format_hint: "", last_polled_at: null,
  gmail_primary_only: false,
};

const FOLDER_A = {
  id: 10, name: "Asana", description: "", keywords: ["asana.com"],
  color: "indigo", email_count: 0,
};

const FOLDER_B = {
  id: 11, name: "Jira", description: "", keywords: ["jira.atlassian.net"],
  color: "blue", email_count: 3,
};

function mockApis({ configs = [CONFIG_A], folders = [FOLDER_A] } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/api/email/configs/") return Promise.resolve({ data: configs });
    if (url === "/api/email/folders/") return Promise.resolve({ data: folders });
    return Promise.resolve({ data: [] });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderAndWait(overrides) {
  mockApis(overrides);
  const { result } = renderHook(() => useEmailConfigs());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useEmailConfigs — initial fetch", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("starts with loading=true and empty lists", () => {
    mockApis();
    const { result } = renderHook(() => useEmailConfigs());
    expect(result.current.loading).toBe(true);
    expect(result.current.configs).toEqual([]);
    expect(result.current.folders).toEqual([]);
  });

  it("populates configs and folders after fetch", async () => {
    const result = await renderAndWait({ configs: [CONFIG_A, CONFIG_B], folders: [FOLDER_A] });
    expect(result.current.configs).toHaveLength(2);
    expect(result.current.folders).toHaveLength(1);
  });

  it("sets error when configs fetch fails", async () => {
    api.get.mockRejectedValue({ response: { data: { detail: "Server error" } } });
    const { result } = renderHook(() => useEmailConfigs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

describe("useEmailConfigs — createConfig", () => {
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

  it("appends new config to state and shows toast on success", async () => {
    const newConfig = { ...CONFIG_A, id: 99, label: "New Inbox" };
    mockApis({ configs: [] });
    api.post.mockResolvedValue({ data: newConfig });

    const result = await renderAndWait({ configs: [] });

    await act(async () => {
      await result.current.createConfig({ label: "New Inbox", username: "x@y.com", password: "pw" });
    });

    expect(result.current.configs).toHaveLength(1);
    expect(result.current.configs[0].label).toBe("New Inbox");
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("added"));
  });

  it("returns ok=true on success", async () => {
    mockApis({ configs: [] });
    api.post.mockResolvedValue({ data: CONFIG_A });
    const result = await renderAndWait({ configs: [] });

    let outcome;
    await act(async () => {
      outcome = await result.current.createConfig({});
    });
    expect(outcome.ok).toBe(true);
  });

  it("fires toast.error for each field error on failure", async () => {
    mockApis({ configs: [] });
    api.post.mockRejectedValue({
      response: { data: { username: ["Enter a valid email."], password: ["This field is required."] } },
    });
    const result = await renderAndWait({ configs: [] });

    await act(async () => {
      await result.current.createConfig({});
    });
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("returns ok=false on failure", async () => {
    mockApis({ configs: [] });
    api.post.mockRejectedValue({ response: { data: {} } });
    const result = await renderAndWait({ configs: [] });

    let outcome;
    await act(async () => {
      outcome = await result.current.createConfig({});
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("useEmailConfigs — updateConfig", () => {
  beforeEach(() => { api.get.mockReset(); api.patch.mockReset(); toast.success.mockReset(); });

  it("replaces the updated config in state", async () => {
    mockApis({ configs: [CONFIG_A] });
    const updated = { ...CONFIG_A, label: "Changed Label" };
    api.patch.mockResolvedValue({ data: updated });

    const result = await renderAndWait({ configs: [CONFIG_A] });

    await act(async () => {
      await result.current.updateConfig(CONFIG_A.id, { label: "Changed Label" });
    });

    expect(result.current.configs[0].label).toBe("Changed Label");
    expect(toast.success).toHaveBeenCalled();
  });

  it("calls the correct URL", async () => {
    mockApis({ configs: [CONFIG_A] });
    api.patch.mockResolvedValue({ data: CONFIG_A });
    const result = await renderAndWait({ configs: [CONFIG_A] });

    await act(async () => {
      await result.current.updateConfig(1, { label: "X" });
    });
    expect(api.patch).toHaveBeenCalledWith("/api/email/configs/1/", { label: "X" });
  });
});

describe("useEmailConfigs — deleteConfig", () => {
  beforeEach(() => { api.get.mockReset(); api.delete.mockReset(); toast.success.mockReset(); });

  it("removes the config from state on success", async () => {
    mockApis({ configs: [CONFIG_A, CONFIG_B] });
    api.delete.mockResolvedValue({});

    const result = await renderAndWait({ configs: [CONFIG_A, CONFIG_B] });

    await act(async () => {
      await result.current.deleteConfig(CONFIG_A.id);
    });

    expect(result.current.configs).toHaveLength(1);
    expect(result.current.configs[0].id).toBe(CONFIG_B.id);
    expect(toast.success).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

describe("useEmailConfigs — testConfig", () => {
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

  it("sets testingId while the request is in flight", async () => {
    mockApis({ configs: [CONFIG_A] });
    let resolveTest;
    api.post.mockReturnValue(new Promise((res) => { resolveTest = res; }));

    const result = await renderAndWait({ configs: [CONFIG_A] });

    act(() => { result.current.testConfig(CONFIG_A.id); });
    expect(result.current.testingId).toBe(CONFIG_A.id);

    await act(async () => { resolveTest({ data: { ok: true, detail: "Connected." } }); });
    expect(result.current.testingId).toBeNull();
  });

  it("stores ok:true result in testResult", async () => {
    mockApis({ configs: [CONFIG_A] });
    api.post.mockResolvedValue({ data: { ok: true, detail: "Connected to imap.gmail.com successfully." } });

    const result = await renderAndWait({ configs: [CONFIG_A] });

    await act(async () => {
      await result.current.testConfig(CONFIG_A.id);
    });
    expect(result.current.testResult[CONFIG_A.id].ok).toBe(true);
  });

  it("stores ok:false result when connection fails", async () => {
    mockApis({ configs: [CONFIG_A] });
    api.post.mockRejectedValue({ response: { data: { detail: "Login failed." } } });

    const result = await renderAndWait({ configs: [CONFIG_A] });

    await act(async () => {
      await result.current.testConfig(CONFIG_A.id);
    });
    expect(result.current.testResult[CONFIG_A.id].ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Folder CRUD
// ---------------------------------------------------------------------------

describe("useEmailConfigs — folder CRUD", () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset();
    api.patch.mockReset(); api.delete.mockReset();
    toast.success.mockReset(); toast.error.mockReset();
  });

  it("createFolder appends to state", async () => {
    mockApis({ folders: [] });
    api.post.mockResolvedValue({ data: FOLDER_A });

    const result = await renderAndWait({ folders: [] });
    await act(async () => { await result.current.createFolder({ name: "Asana", keywords: ["asana.com"] }); });

    expect(result.current.folders).toHaveLength(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it("updateFolder replaces the matching folder in state", async () => {
    mockApis({ folders: [FOLDER_A] });
    const updated = { ...FOLDER_A, name: "Asana (Updated)" };
    api.patch.mockResolvedValue({ data: updated });

    const result = await renderAndWait({ folders: [FOLDER_A] });
    await act(async () => { await result.current.updateFolder(FOLDER_A.id, { name: "Asana (Updated)" }); });

    expect(result.current.folders[0].name).toBe("Asana (Updated)");
  });

  it("deleteFolder removes from state", async () => {
    mockApis({ folders: [FOLDER_A, FOLDER_B] });
    api.delete.mockResolvedValue({});

    const result = await renderAndWait({ folders: [FOLDER_A, FOLDER_B] });
    await act(async () => { await result.current.deleteFolder(FOLDER_A.id); });

    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0].id).toBe(FOLDER_B.id);
  });
});

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { RightPanel } from "@/components/dossier/right-panel";

describe("RightPanel", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows live file tree when projectId is set and files API returns data", async () => {
    const fileTree = [
      {
        name: "src",
        type: "folder",
        path: "/src",
        children: [{ name: "App.tsx", type: "file", path: "/src/App.tsx" }],
      },
    ];
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(fileTree) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    render(
      <RightPanel
        isOpen
        onClose={() => {}}
        activeDoc={null}
        activeTab="files"
        onTabChange={() => {}}
        projectId="p1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("App.tsx")).toBeInTheDocument();
    });
  });

  it("shows empty file area when projectId is set but no files", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    render(
      <RightPanel
        isOpen
        onClose={() => {}}
        activeDoc={null}
        activeTab="files"
        onTabChange={() => {}}
        projectId="p1"
        baseBranch="main"
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/p1/files?source=repo");
    });
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("labels the files base branch with the project's default branch, not a hardcoded main", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    render(
      <RightPanel
        isOpen
        onClose={() => {}}
        activeDoc={null}
        activeTab="files"
        onTabChange={() => {}}
        projectId="p1"
        baseBranch="master"
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/projects/p1/files?source=repo");
    });
    expect(screen.getByText("master")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("shows the base branch name in the switch-back control when viewing a card branch", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    render(
      <RightPanel
        isOpen
        onClose={() => {}}
        activeDoc={null}
        activeTab="files"
        onTabChange={() => {}}
        projectId="p1"
        baseBranch="master"
        filesBranchCardId="card-1"
        onFilesBranchChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Switch to master branch" })).toBeInTheDocument();
    expect(screen.getByText("Show master")).toBeInTheDocument();
    expect(screen.queryByText("Show main")).not.toBeInTheDocument();
  });
});

import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { useEntities } from "../../api/useEntities";
import { useEntityAttributes } from "../../api/useEntityAttributes";
import { useMigrationJob, useStartMigration } from "../../api/useMigrationJob";
import { usePreviewRecords, useRecordCount } from "../../api/usePreviewRecords";
import { httpServer } from "../../../../../../test/support/httpServer";
import {
  createFakeDesktopBridge,
  installDesktopBridge,
} from "../../../../../../test/support/desktopBridge";
import { createTestQueryClient } from "../../../../../../test/support/render";

function createQueryWrapper(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("Data Migration API", () => {
  it("previews records using the selected source connection", async () => {
    let requestBody: unknown;
    let environmentHeader: string | null = null;

    httpServer.use(
      http.post("http://localhost/api/migration/preview", async ({ request }) => {
        requestBody = await request.json();
        environmentHeader = request.headers.get("X-Environment-Url");
        return HttpResponse.json({
          records: [{ id: "account-1", name: "Contoso" }],
          pagingCookie: null,
          moreRecords: false,
        });
      }),
    );

    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) =>
          name === "Preview Source"
            ? {
                id: name,
                envUrl: "https://preview.example.test",
                crmType: "online",
                token: "preview-token",
                expiresOn: "2099-01-01T00:00:00.000Z",
              }
            : { error: `Unexpected preview connection: ${name}` },
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () =>
        usePreviewRecords({
          connectionId: "Preview Source",
          entityLogicalName: "account",
          pageSize: 25,
          page: 1,
        }),
      {
        wrapper: createQueryWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({
      entityLogicalName: "account",
      pageSize: 25,
      page: 1,
    });
    expect(environmentHeader).toBe("https://preview.example.test");
    expect(result.current.data).toEqual({
      records: [{ id: "account-1", name: "Contoso", existsInTarget: null }],
      pagingCookie: null,
      moreRecords: false,
    });
  });

  it("checks previewed records against the target", async () => {
    let existingBody: unknown;
    let targetHeader: string | null = null;
    httpServer.use(
      http.post("http://localhost/api/migration/preview", () =>
        HttpResponse.json({
          records: [
            { id: "AAAA-1", name: "Contoso" },
            { id: "bbbb-2", name: "Fabrikam" },
          ],
          pagingCookie: null,
          moreRecords: false,
        }),
      ),
      http.post("http://localhost/api/migration/existing", async ({ request }) => {
        existingBody = await request.json();
        targetHeader = request.headers.get("X-Target-Environment-Url");
        return HttpResponse.json({ existingIds: ["aaaa-1"] });
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          id: name,
          envUrl: `https://${name.toLowerCase()}.example.test`,
          crmType: "online",
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () =>
        usePreviewRecords({
          connectionId: "Source",
          targetConnectionId: "Target",
          entityLogicalName: "account",
        }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(existingBody).toEqual({ entityLogicalName: "account", ids: ["AAAA-1", "bbbb-2"] });
    expect(targetHeader).toBe("https://target.example.test");
    expect(result.current.data?.records).toEqual([
      { id: "AAAA-1", name: "Contoso", existsInTarget: true },
      { id: "bbbb-2", name: "Fabrikam", existsInTarget: false },
    ]);
  });

  it("counts the records the migration will send", async () => {
    let countBody: unknown;
    httpServer.use(
      http.post("http://localhost/api/migration/count", async ({ request }) => {
        countBody = await request.json();
        return HttpResponse.json({ count: 1234 });
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          id: name,
          envUrl: "https://count.example.test",
          crmType: "online",
          token: "count-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () =>
        useRecordCount({
          connectionId: "Count Source",
          entityLogicalName: "account",
          fetchXmlFilter: "<filter />",
        }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(countBody).toEqual({ entityLogicalName: "account", fetchXmlFilter: "<filter />" });
    expect(result.current.data).toEqual({ count: 1234, existing: null });
  });

  it("counts how many of all the records already exist in the target", async () => {
    let countBody: unknown;
    let targetHeader: string | null = null;
    httpServer.use(
      http.post("http://localhost/api/migration/count/target", async ({ request }) => {
        countBody = await request.json();
        targetHeader = request.headers.get("X-Target-Environment-Url");
        return HttpResponse.json({ count: 1234, existing: 1000 });
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          id: name,
          envUrl: `https://${name.toLowerCase()}.example.test`,
          crmType: "online",
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () =>
        useRecordCount({
          connectionId: "Source",
          targetConnectionId: "Target",
          entityLogicalName: "account",
        }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(countBody).toEqual({ entityLogicalName: "account" });
    expect(targetHeader).toBe("https://target.example.test");
    expect(result.current.data).toEqual({ count: 1234, existing: 1000 });
  });

  it("loads metadata with stable query keys and cache times", async () => {
    const requestedEnvironmentHeaders: Array<string | null> = [];
    httpServer.use(
      http.get("http://localhost/api/metadata/entities", ({ request }) => {
        requestedEnvironmentHeaders.push(request.headers.get("X-Environment-Url"));
        return HttpResponse.json([]);
      }),
      http.get("http://localhost/api/metadata/entities/account/attributes", ({ request }) => {
        requestedEnvironmentHeaders.push(request.headers.get("X-Environment-Url"));
        return HttpResponse.json([]);
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) =>
          name === "Metadata Source"
            ? {
                id: name,
                envUrl: "https://metadata.example.test",
                crmType: "online",
                token: "metadata-token",
                expiresOn: "2099-01-01T00:00:00.000Z",
              }
            : { error: `Unexpected metadata connection: ${name}` },
      }),
    );
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const entities = renderHook(() => useEntities("Metadata Source"), { wrapper });
    const attributes = renderHook(
      () => useEntityAttributes("account", "Metadata Source"),
      { wrapper },
    );

    await waitFor(() => expect(entities.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(attributes.result.current.isSuccess).toBe(true));
    const entitiesQuery = queryClient.getQueryCache().find({
      queryKey: ["migration", "entities", "Metadata Source"],
    });
    const attributesQuery = queryClient.getQueryCache().find({
      queryKey: ["migration", "attributes", "Metadata Source", "account"],
    });

    expect(entitiesQuery?.queryKey).toEqual([
      "migration",
      "entities",
      "Metadata Source",
    ]);
    expect(attributesQuery?.queryKey).toEqual([
      "migration",
      "attributes",
      "Metadata Source",
      "account",
    ]);
    const entitiesOptions = entitiesQuery?.options as
      | { staleTime?: number }
      | undefined;
    const attributesOptions = attributesQuery?.options as
      | { staleTime?: number }
      | undefined;
    expect(entitiesOptions?.staleTime).toBe(5 * 60 * 1000);
    expect(attributesOptions?.staleTime).toBe(5 * 60 * 1000);
    expect(requestedEnvironmentHeaders).toEqual([
      "https://metadata.example.test",
      "https://metadata.example.test",
    ]);
  });

  it("keeps queries idle until their required inputs exist", () => {
    installDesktopBridge(createFakeDesktopBridge());
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => ({
        entities: useEntities(null),
        attributes: useEntityAttributes(null, null),
        preview: usePreviewRecords(null),
        job: useMigrationJob(null),
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.entities.fetchStatus).toBe("idle");
    expect(result.current.attributes.fetchStatus).toBe("idle");
    expect(result.current.preview.fetchStatus).toBe("idle");
    expect(result.current.job.fetchStatus).toBe("idle");
  });

  it("starts a migration and polls only while its job is active", async () => {
    let migrationRequest: unknown;
    let sourceEnvironmentHeader: string | null = null;
    let targetEnvironmentHeader: string | null = null;
    httpServer.use(
      http.post("http://localhost/api/migration/run", async ({ request }) => {
        migrationRequest = await request.json();
        sourceEnvironmentHeader = request.headers.get("X-Environment-Url");
        targetEnvironmentHeader = request.headers.get("X-Target-Environment-Url");
        return HttpResponse.json({ jobId: "polling-job" });
      }),
      http.get("http://localhost/api/migration/jobs/polling-job", () =>
        HttpResponse.json({
          status: "running",
          processed: 1,
          total: 2,
          succeeded: 1,
          created: 1,
          updated: 0,
          skipped: 0,
          deleted: 0,
          failed: 0,
          errors: [],
        }),
      ),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getActiveConnection: async () => ({
          id: "Polling Source",
          envUrl: "https://polling-source.example.test",
          crmType: "online",
          token: "polling-source-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
        getConnection: async (name) => ({
          id: name,
          envUrl:
            name === "Polling Source"
              ? "https://polling-source.example.test"
              : "https://polling-target.example.test",
          crmType: "online",
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const start = renderHook(() => useStartMigration(), { wrapper });

    await act(async () => {
      await start.result.current.mutateAsync({
        entityLogicalName: "account",
        attributes: ["accountid"],
        create: false,
        update: true,
        delete: false,
        sourceConnectionId: "Polling Source",
        targetConnectionId: "Polling Target",
      });
    });

    expect(migrationRequest).toEqual({
      entityLogicalName: "account",
      attributes: ["accountid"],
      create: false,
      update: true,
      delete: false,
    });
    expect(sourceEnvironmentHeader).toBe("https://polling-source.example.test");
    expect(targetEnvironmentHeader).toBe("https://polling-target.example.test");

    const job = renderHook(() => useMigrationJob("polling-job"), { wrapper });
    await waitFor(() => expect(job.result.current.data?.status).toBe("running"));
    const jobQuery = queryClient.getQueryCache().find({
      queryKey: ["migration", "job", "polling-job"],
    });
    if (!jobQuery) {
      throw new Error("Expected the migration job query to exist");
    }
    const jobOptions = jobQuery.options as typeof jobQuery.options & {
      refetchInterval?:
        | number
        | false
        | ((query: typeof jobQuery) => number | false);
    };
    const refetchInterval = jobOptions.refetchInterval;
    expect(refetchInterval).toBeTypeOf("function");
    if (typeof refetchInterval !== "function") {
      throw new Error("Expected the migration job to define a polling function");
    }

    expect(refetchInterval(jobQuery)).toBe(1000);
    jobQuery.setData({
      status: "completed",
      processed: 2,
      total: 2,
      succeeded: 2,
      created: 1,
      updated: 1,
      skipped: 0,
      deleted: 0,
      failed: 0,
      errors: [],
    });
    expect(refetchInterval(jobQuery)).toBe(false);
  });
});

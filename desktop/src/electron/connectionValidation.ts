type FetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

type FetchImpl = (
  url: string,
  options: {
    method: "GET";
    headers: Record<string, string>;
  }
) => Promise<FetchResponse>;

type ValidationOptions = {
  apiBaseUrl: string;
  localSecret: string;
  envUrl: string;
  accessToken: string;
  fetchImpl?: FetchImpl;
};

type ConnectionValidationResponse = {
  connected?: boolean;
  error?: string;
  userId?: string;
};

export async function validateDataverseConnection({
  apiBaseUrl,
  localSecret,
  envUrl,
  accessToken,
  fetchImpl = fetch as FetchImpl,
}: ValidationOptions): Promise<{ connected: true; userId?: string }> {
  const url = new URL("/api/connect", apiBaseUrl);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Environment-Url": envUrl,
      "X-Local-Secret": localSecret,
    },
  });

  let body: ConnectionValidationResponse = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as ConnectionValidationResponse;
    }
  } catch {
    // Fall through to the generic status message below.
  }

  if (!response.ok || body.connected !== true) {
    throw new Error(
      body.error ||
        `Dataverse connection validation failed${
          response.status ? ` (${response.status} ${response.statusText ?? ""})` : ""
        }.`.trim()
    );
  }

  return { connected: true, userId: body.userId };
}

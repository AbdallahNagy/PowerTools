type FetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

type FetchImpl = (
  url: string,
  options: {
    method: "GET" | "POST" | "DELETE";
    headers: Record<string, string>;
    body?: string;
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
  success?: boolean;
  error?: string;
  userId?: string;
};

type OnPremisesConnectionOptions = {
  apiBaseUrl: string;
  localSecret: string;
  name: string;
  envUrl: string;
  authMode: "ad" | "ifd";
  username: string;
  password: string;
  domain: string;
  fetchImpl?: FetchImpl;
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

export async function validateOnPremisesConnection(
  options: OnPremisesConnectionOptions
): Promise<{ connected: true; userId?: string }> {
  const body = await postOnPremisesConnection(
    "/api/connections/validate-onpremise",
    options
  );

  if (body.connected !== true) {
    throw new Error(body.error || "On-premises connection validation failed.");
  }

  return { connected: true, userId: body.userId };
}

export async function registerOnPremisesConnection(
  options: OnPremisesConnectionOptions
): Promise<void> {
  const body = await postOnPremisesConnection(
    "/api/connections/register-onpremise",
    options
  );

  if (body.success !== true) {
    throw new Error(body.error || "On-premises connection registration failed.");
  }
}

export async function unregisterOnPremisesConnection({
  apiBaseUrl,
  localSecret,
  name,
  fetchImpl = fetch as FetchImpl,
}: {
  apiBaseUrl: string;
  localSecret: string;
  name: string;
  fetchImpl?: FetchImpl;
}): Promise<void> {
  const url = new URL(`/api/connections/${encodeURIComponent(name)}`, apiBaseUrl);
  const response = await fetchImpl(url.toString(), {
    method: "DELETE",
    headers: {
      "X-Local-Secret": localSecret,
    },
  });

  if (!response.ok) {
    throw new Error("On-premises connection unregister failed.");
  }
}

async function postOnPremisesConnection(
  path: string,
  {
    apiBaseUrl,
    localSecret,
    name,
    envUrl,
    authMode,
    username,
    password,
    domain,
    fetchImpl = fetch as FetchImpl,
  }: OnPremisesConnectionOptions
): Promise<ConnectionValidationResponse> {
  const url = new URL(path, apiBaseUrl);
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-Secret": localSecret,
    },
    body: JSON.stringify({
      name,
      environmentUrl: envUrl,
      authMode,
      username,
      password,
      domain,
    }),
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

  if (!response.ok) {
    throw new Error(
      body.error ||
        `On-premises connection request failed${
          response.status ? ` (${response.status} ${response.statusText ?? ""})` : ""
        }.`.trim()
    );
  }

  return body;
}

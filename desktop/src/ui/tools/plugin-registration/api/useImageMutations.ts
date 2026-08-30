import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { PluginImage } from "../model/contracts";

export type ImageOperation = "create" | "update" | "unregister";
export interface ImageDraft { stepId: string; imageType: number; alias: string; messagePropertyName: string;
  attributes: string[]; expectedVersions: Record<string, number>; }
export interface ImagePreflight { draft: ImageDraft; before: ImageValues | null; after: ImageValues;
  plan: { token: string; blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[];
    changes: { field: string; before: string | null; after: string | null }[]; confirmation: { message: string; requiredText?: string | null } }; }
interface ImageValues { name: string; imageType: number; alias: string; messagePropertyName: string; attributes: string[]; }

function route(operation: ImageOperation, imageId: string | null, action: "preflight" | "execute") {
  return operation === "create" ? `/api/plugin-registration/images/create/${action}`
    : `/api/plugin-registration/images/${imageId}/${operation}/${action}`;
}

export function useImageMutations(connectionName: string | null, refreshCatalog: () => Promise<unknown>) {
  const client = useQueryClient();
  const meta = { connectionName: connectionName ?? undefined };
  const preflight = useMutation({ mutationFn: ({ operation, imageId, draft }: { operation: ImageOperation; imageId: string | null; draft: ImageDraft }) =>
    apiPost<ImagePreflight>(route(operation, imageId, "preflight"), draft, { meta }), retry: false });
  const execute = useMutation({ mutationFn: ({ operation, imageId, draft, token, typedName }: { operation: ImageOperation; imageId: string | null; draft: ImageDraft; token: string; typedName?: string }) =>
    apiPost<{ outcome: string; succeededAndVerified: boolean; image: PluginImage | null }>(route(operation, imageId, "execute"),
      { draft, planToken: token, typedName: typedName ?? null }, { meta }), retry: false,
    onSuccess: async result => { if (!result.succeededAndVerified || !connectionName) return;
      await client.invalidateQueries({ queryKey: ["plugin-registration", "catalog", connectionName] }); await refreshCatalog(); } });
  return { preflight, execute };
}

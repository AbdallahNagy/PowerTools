import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";

export interface Account {
  id: string;
  name: string | null;
  email: string | null;
}

export function useAccounts(enabled = false) {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<Account[]>("/api/accounts"),
    enabled,
  });
}

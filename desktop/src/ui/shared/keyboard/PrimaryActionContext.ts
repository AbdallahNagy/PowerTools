import { createContext } from "react";

export interface PrimaryAction {
  label: string;
  enabled: boolean;
  run: () => void;
}

export interface PrimaryActionRegistry {
  register: (instanceId: string, action: PrimaryAction) => () => void;
  get: (instanceId: string) => PrimaryAction | null;
}

export const PrimaryActionRegistryContext = createContext<PrimaryActionRegistry | null>(null);
export const PrimaryActionScopeContext = createContext<string | null>(null);

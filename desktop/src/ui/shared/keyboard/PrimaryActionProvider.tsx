import { useMemo, useRef, type ReactNode } from "react";

import {
  PrimaryActionRegistryContext,
  PrimaryActionScopeContext,
  type PrimaryAction,
  type PrimaryActionRegistry,
} from "./PrimaryActionContext";

export function PrimaryActionProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Map<string, PrimaryAction>());
  const registry = useMemo<PrimaryActionRegistry>(
    () => ({
      register(instanceId, action) {
        registrations.current.set(instanceId, action);
        return () => {
          if (registrations.current.get(instanceId) === action) {
            registrations.current.delete(instanceId);
          }
        };
      },
      get(instanceId) {
        return registrations.current.get(instanceId) ?? null;
      },
    }),
    [],
  );

  return (
    <PrimaryActionRegistryContext.Provider value={registry}>
      {children}
    </PrimaryActionRegistryContext.Provider>
  );
}

export function PrimaryActionScope({
  instanceId,
  children,
}: {
  instanceId: string;
  children: ReactNode;
}) {
  return (
    <PrimaryActionScopeContext.Provider value={instanceId}>
      {children}
    </PrimaryActionScopeContext.Provider>
  );
}

import { useContext, useEffect, useRef } from "react";

import {
  PrimaryActionRegistryContext,
  PrimaryActionScopeContext,
  type PrimaryAction,
  type PrimaryActionRegistry,
} from "./PrimaryActionContext";

export function usePrimaryActionRegistry(): PrimaryActionRegistry | null {
  return useContext(PrimaryActionRegistryContext);
}

export function usePrimaryAction({ label, enabled, run }: PrimaryAction) {
  const registry = useContext(PrimaryActionRegistryContext);
  const instanceId = useContext(PrimaryActionScopeContext);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!registry || !instanceId) return;
    return registry.register(instanceId, {
      label,
      enabled,
      run: () => runRef.current(),
    });
  }, [enabled, instanceId, label, registry]);
}

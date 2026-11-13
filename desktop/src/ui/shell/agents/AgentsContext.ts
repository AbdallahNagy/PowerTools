import { createContext } from "react";

export interface AgentsContextValue {
  openAgents(): void;
}

/** Without a provider there is no Agents dialog to open. */
export const AgentsContext = createContext<AgentsContextValue>({ openAgents: () => undefined });

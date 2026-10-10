const TOOL_STATUS_PREFIX = "tool:";

/** Status item ID owned by one hosted tool instance. */
export function toolStatusId(instanceId: string) {
  return `${TOOL_STATUS_PREFIX}${instanceId}`;
}

/**
 * Tool status items belong to one tab. Other status items are global and
 * always visible.
 */
export function isStatusVisibleForTab(statusId: string, activeTabId: string) {
  if (!statusId.startsWith(TOOL_STATUS_PREFIX)) return true;
  return statusId === toolStatusId(activeTabId);
}

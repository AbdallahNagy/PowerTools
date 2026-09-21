export const TITLE_BAR_MENUS = ["file", "edit", "view", "help"] as const;
export type TitleBarMenuId = (typeof TITLE_BAR_MENUS)[number];

export const TITLE_BAR_MENU_LABELS: Record<TitleBarMenuId, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
  help: "Help",
};

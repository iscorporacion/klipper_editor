export const macroWidgetsKey = "klipper-editor-custom-macro-widgets";
export const buttonSizes = {
  "1x1": [1, 1], "2x1": [2, 1], "2x2": [2, 2], "1x4": [4, 1]
} as const;
export type IconReference = { collection: string; name: string };
export type MacroButton = {
  id: string; name: string; description: string; command: string;
  size: keyof typeof buttonSizes; color: string; icon: IconReference; alignment: "left" | "center" | "right"; showTitle: boolean;
};
export type MacroWidgetConfig = { id: `custom-macros:${string}`; title: string; buttons: MacroButton[] };
export function isCustomMacroWidget(id: string): id is MacroWidgetConfig["id"] {
  return /^custom-macros:[a-zA-Z0-9-]+$/.test(id);
}
export function parseMacroCommand(value: unknown) {
  if (typeof value !== "string" || value.length > 2000 || /[\r\n\0]/.test(value)) throw new Error("Invalid macro command");
  const script = value.trim();
  const match = script.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s|$)/);
  if (!match) throw new Error("Invalid macro name");
  return { name: match[1].toUpperCase(), script };
}
export function normalizeMacroWidgets(value: unknown): MacroWidgetConfig[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item) => item && typeof item.id === "string" && isCustomMacroWidget(item.id) && !seen.has(item.id) && seen.add(item.id))
    .slice(0, 30).map((item) => {
      const buttonIds = new Set<string>();
      return {
        id: item.id, title: String(item.title || "Macros").slice(0, 80),
        buttons: (Array.isArray(item.buttons) ? item.buttons : []).filter((button: MacroButton) => button && typeof button.id === "string" && !buttonIds.has(button.id) && buttonIds.add(button.id)).slice(0, 100).map((button: MacroButton) => ({
          id: button.id, name: String(button.name || "Macro").slice(0, 80), description: String(button.description || "").slice(0, 500),
          command: String(button.command || "").slice(0, 2000),
          size: Object.hasOwn(buttonSizes, button.size) ? button.size : "1x1",
          alignment: button.alignment === "left" || button.alignment === "right" ? button.alignment : "center",
          showTitle: button.size !== "1x1" && Object.hasOwn(buttonSizes, button.size)
            && (typeof button.showTitle === "boolean" ? button.showTitle : ["2x2", "1x4"].includes(button.size)),
          color: /^#[0-9a-f]{6}$/i.test(button.color) ? button.color : "#4da3ff",
          icon: button.icon && /^[a-z0-9]+$/.test(button.icon.collection) && /^[A-Za-z0-9]+$/.test(button.icon.name)
            ? { collection: button.icon.collection, name: button.icon.name } : { collection: "md", name: "MdPlayArrow" }
        }))
      };
    });
}

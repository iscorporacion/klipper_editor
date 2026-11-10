export type PromptButton = { label: string; command: string; style: string; group: number; footer: boolean };
export type PrinterPrompt = { id: string; title: string; text: string[]; buttons: PromptButton[]; shown: boolean; kind?: "purgeTrayNotHomed" };
export function readPrinterPrompt(entries: { time: number; type: string; message: string }[]): PrinterPrompt | null {
  let prompt: PrinterPrompt | null = null;
  let detected: PrinterPrompt | null = null;
  let group = 0;
  let grouped = false;
  for (const entry of entries) {
    if (entry.type !== "response") continue;
    if (/Purge tray is not homed/i.test(entry.message)) {
      detected = {
        id: `detected:${entry.time}:purge-tray-not-homed`,
        title: "Purge tray is not homed",
        text: entry.message.split(/\r?\n/).map((line) => line.replace(/^\s*!!\s*/, "").trim()).filter(Boolean).slice(0, 20),
        buttons: [{ label: "Home purge tray", command: "PURGE_TRAY_HOME", style: "primary", group: 0, footer: true }],
        shown: true,
        kind: "purgeTrayNotHomed"
      };
    }
    for (const [index, line] of entry.message.split(/\r?\n/).entries()) {
      const match = /^(?:\/\/\s*|echo:\s*)?action:prompt_(\w+)(?:\s+(.*))?\s*$/.exec(line.trim());
      if (!match) continue;
      const [, action, value = ""] = match;
      if (action === "begin") {
        prompt = { id: `${entry.time}:${index}:${value}`, title: value, text: [], buttons: [], shown: false };
        group = 0; grouped = false;
      } else if (action === "end") prompt = null;
      else if (prompt) {
        if (action === "show") prompt.shown = true;
        else if (action === "text" && prompt.text.length < 100) prompt.text.push(value);
        else if (action === "button_group_start") { group++; grouped = true; }
        else if (action === "button_group_end") { group++; grouped = false; }
        else if (["button", "footer_button"].includes(action) && prompt.buttons.length < 100) {
          const [label, command = label, style = "default"] = value.split("|");
          if (label && command && command.length <= 4000 && !/[\x00-\x08\x0b-\x1f]/.test(command)) {
            prompt.buttons.push({ label, command, style: ["primary", "secondary", "info", "warning", "error"].includes(style) ? style : "default", group, footer: action === "footer_button" });
            if (!grouped) group++;
          }
        }
      }
    }
  }
  return prompt?.shown ? prompt : detected;
}

export function promptCancelsPrint(button: PromptButton): boolean {
  return /(?:^|\s)(?:[A-Z_]*CANCEL_PRINT[A-Z_]*)(?:\s|$)/i.test(button.command) || /cancel.*(?:print|impresi)|(?:print|impresi).*cancel/i.test(button.label);
}

export function promptResumesPrint(button: PromptButton): boolean {
  return /(?:^|\s)(?:[A-Z_]*RESUME[A-Z_]*)(?:\s|$)/i.test(button.command);
}

const transientKeys = [
  "status.opened", "status.created", "status.uploaded", "status.deleted", "status.deletedSelected", "status.renamed",
  "status.saved", "status.savedWithBackup", "status.executedMacro", "status.gcodeSent", "status.printStarted",
  "status.printPaused", "status.printResumed", "status.printCancelled", "status.heatersRefreshed", "status.heaterCooling",
  "status.heatersSet", "status.auxiliariesRefreshed", "status.auxiliarySet", "status.moveDone", "status.extruded",
  "status.updatesLoaded", "status.firmwareRestarted", "status.terminalConnected", "status.terminalDisconnected",
  "status.terminalSettingSaved", "status.mcpTunnelStopped", "status.mcpTunnelReady", "status.mcpTunnelUrlCopied",
  "status.bedMeshActionDone", "status.themeImported", "status.reloadedOpenFiles", "status.reloadedOpenFilesPartial",
  "status.wildcardInclude", "mmu.actionDone", "mmu.imported"
] as const;

export function transientStatusPatterns(translate: (key: string) => string): RegExp[] {
  return transientKeys.flatMap((key) => {
    const template = translate(key);
    if (!template || template === key) return [];
    const parts = template.split(/(\{[a-zA-Z]\w*\})/g);
    const pattern = parts.map((part, index) => index % 2 ? "[\\s\\S]+?" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
    return [new RegExp(`^${pattern}$`)];
  });
}

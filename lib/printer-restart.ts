export function isRestartBlockedByPrint(status: { printing: boolean; webhooksState: string }) {
  // print_stats may retain "printing" after an emergency shutdown.
  return status.printing && status.webhooksState.trim().toLowerCase() !== "shutdown";
}

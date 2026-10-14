export function isMmuPrintActive(printState: unknown, mmu: Record<string, unknown> | null) {
  const job = String(printState ?? "").trim().toLowerCase();
  const mmuJob = String(mmu?.print_state ?? "").trim().toLowerCase();
  return ["printing", "paused"].includes(job) || Boolean(mmu?.is_in_print)
    || ["started", "printing", "paused"].includes(mmuJob);
}

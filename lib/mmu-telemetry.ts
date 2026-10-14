export const mmuTelemetryFields = [
  "enabled", "num_gates", "is_homed", "is_locked", "is_paused", "is_in_print", "print_state", "unit", "tool", "gate",
  "active_filament", "operation", "filament_pos", "filament_position", "filament_direction", "bowden_progress",
  "ttg_map", "gate_status", "gate_filament_name", "gate_material", "gate_vendor", "gate_color", "gate_temperature",
  "gate_spool_id", "gate_speed_override", "action", "has_bypass", "spoolman_support", "encoder", "flowguard",
  "sync_feedback_flow_rate", "sync_feedback_enabled", "sync_feedback_state", "sync_feedback_bias_modelled",
  "sync_feedback_bias_raw", "sync_drive", "sensors", "num_toolchanges", "slicer_tool_map"
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function mergeMmuTelemetry(current: Record<string, unknown> | null, update: Record<string, unknown>) {
  const merged = { ...current, ...update };
  for (const key of ["sensors", "encoder", "flowguard", "active_filament", "slicer_tool_map"]) {
    const patch = record(update[key]);
    if (patch) merged[key] = { ...record(current?.[key]), ...patch };
  }
  return merged;
}

export function mmuPathTelemetry(mmu: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const sensors = record(mmu.sensors) ?? {};
  const sensor = (name: string): boolean | null => typeof sensors[name] === "boolean" ? sensors[name] as boolean : null;
  const phase = number(mmu.filament_pos);
  const bypass = mmu.gate === -2;
  let tip: number | null = null;
  // HH reports stages, not an exact physical coordinate. Bowden progress refines the stages when available.
  if (phase === 0) tip = sensor("mmu_gear") === true ? .16 : sensor("mmu_pre_gate") === true ? .08 : .02;
  if (phase === 1) tip = settings.gate_homing_endstop === "extruder" ? .83 : settings.gate_homing_endstop === "mmu_gear" ? .16 : .26;
  if (phase === 2 || phase === 3) {
    const progress = number(mmu.bowden_progress);
    tip = progress !== null && progress >= 0 ? .32 + .44 * clamp(progress / 100, 0, 1) : phase === 2 ? .32 : .54;
  }
  if (phase !== null && phase >= 4 && phase <= 10 && Number.isInteger(phase)) {
    tip = [.76, .83, .85, .87, .91, sensor("toolhead") === false ? .87 : .95, 1][phase - 4];
  }
  if (bypass && (phase === null || phase < 7)) tip = null;
  const action = String(mmu.action ?? "").toLowerCase();
  const moving = action.startsWith("unloading") || action.startsWith("loading") || action === "purging";
  const reportedDirection = number(mmu.filament_direction);
  const direction = moving ? reportedDirection === -1 || reportedDirection === 0 || reportedDirection === 1 ? reportedDirection : action.startsWith("unloading") ? -1 : 1 : 0;
  const feedbackState = String(mmu.sync_feedback_state ?? "").toLowerCase();
  const feedback = ["neutral", "tension", "compressed"].includes(feedbackState) ? feedbackState : "unknown";
  const bias = number(mmu.sync_feedback_bias_modelled);
  const feedbackEnabled = mmu.sync_feedback_enabled === true || mmu.sync_feedback_enabled === 1;
  const hasBuffer = record(mmu.sensors) ? ["filament_compression", "filament_tension", "filament_proportional"].some((name) => name in sensors)
    : feedbackEnabled && (bias !== null || ["neutral", "tension", "compressed"].includes(feedbackState));
  const bufferActive = hasBuffer && feedbackEnabled && phase !== null && phase >= 4;
  const displacement = bufferActive ? (bias === null ? feedback === "tension" ? -1 : feedback === "compressed" ? 1 : 0 : clamp(bias, -1, 1)) : 0;
  const encoder = record(mmu.encoder);
  const swapMap = record(mmu.slicer_tool_map);
  return {
    phase, tip, bypass, direction, hasBuffer, feedback, bufferActive, bias, displacement,
    sensors: ["mmu_pre_gate", "mmu_gear", "mmu_gate", "extruder", "toolhead"].filter((name) => name in sensors).map((name) => ({ name, detected: sensor(name) })),
    encoder: encoder ? { position: number(encoder.encoder_pos), enabled: encoder.enabled !== false } : null,
    position: number(mmu.filament_position),
    changes: number(mmu.num_toolchanges), totalChanges: number(swapMap?.total_toolchanges),
    synced: mmu.sync_drive === true
  };
}

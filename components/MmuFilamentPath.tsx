"use client";
import { MdSync } from "react-icons/md";
import { mmuPathTelemetry } from "@/lib/mmu-telemetry";
import RichTooltip from "@/components/RichTooltip";

export default function MmuFilamentPath({ mmu, settings, color, locale }: {
  mmu: Record<string, unknown>; settings?: Record<string, unknown>; color: string; locale: string;
}) {
  const data = mmuPathTelemetry(mmu, settings);
  const es = locale !== "en";
  const unknown = es ? "Desconocido" : "Unknown";
  const title = es ? "Recorrido del filamento" : "Filament path";
  const feedback = data.feedback === "neutral" ? "Neutral" : data.feedback === "tension" ? (es ? "Tensión" : "Tension") : data.feedback === "compressed" ? (es ? "Compresión" : "Compression") : unknown;
  const bufferLabel = data.bufferActive ? feedback : (es ? "Inactivo" : "Inactive");
  const tool = data.bypass ? "Bypass" : typeof mmu.tool === "number" && mmu.tool >= 0 ? `T${mmu.tool}` : "T?";
  const y = (fraction: number) => 22 + fraction * 170;
  const start = data.bypass ? y(.83) : 22;
  const end = data.tip === null ? start : y(data.tip);
  const labels: Record<string, string> = { mmu_pre_gate: es ? "Entrada" : "Pre-gate", mmu_gear: es ? "Motor" : "Gear", mmu_gate: "Gate", extruder: "Extruder", toolhead: "Toolhead" };
  const positions: Record<string, number> = { mmu_pre_gate: 35, mmu_gear: 49, mmu_gate: 66, extruder: 163, toolhead: 177 };
  const sensorState = (value: boolean | null) => value === null ? unknown : value ? (es ? "Detectado" : "Detected") : (es ? "Vacío" : "Empty");
  return <RichTooltip content={<span className="rich-tooltip-stack">
    <strong>{title} · {tool}</strong>
    <span>{data.phase === null || data.phase < 0 ? unknown : `${es ? "Etapa" : "Stage"}: ${data.phase}`}{data.position === null ? "" : ` · ${data.position.toFixed(1)} mm`}</span>
    {data.sensors.map((sensor) => <span key={sensor.name}>{labels[sensor.name]}: {sensorState(sensor.detected)}</span>)}
    {data.encoder && <span>Encoder: {data.encoder.position === null ? unknown : `${data.encoder.position.toFixed(1)} mm`}</span>}
    {data.hasBuffer && <span>Buffer: {bufferLabel}{data.bias === null ? "" : ` · ${data.bias.toFixed(2)}`}</span>}
    {data.changes !== null && <span>{es ? "Cambios" : "Swaps"}: {data.changes}{data.totalChanges === null ? "" : ` / ${data.totalChanges}`}</span>}
  </span>}>
    <figure className="mmu-filament-path" tabIndex={0} aria-label={title} data-phase={data.phase ?? "unknown"}>
      <svg viewBox="0 0 140 206" role="img" aria-label={`${title}: ${tool}`}>
        <title>{title}: {data.tip === null ? unknown : `${es ? "Etapa" : "Stage"} ${data.phase}`}</title>
        <text x="15" y="15" className="mmu-path-tool">{tool}</text>
        {data.synced && <MdSync x="112" y="1" width="16" height="16" title={es ? "Sincronizado" : "Synced"} />}
        <path d="M29 22 V192 L33 199 L37 192 V22" fill="none" className={`mmu-path-outline ${data.bypass ? "bypass" : ""}`} />
        <rect x="31" y={start} width="4" height={Math.max(0, end - start)} fill={color} className="mmu-path-filament" />
        {data.tip === 1 && <polygon points="31,192 35,192 33,197" fill={color} />}
        {data.direction !== 0 && end > start && <line x1="33" x2="33" y1={start} y2={end} className={`mmu-path-motion ${data.direction < 0 ? "reverse" : ""}`} />}
        {data.tip === null && <text x="43" y="192" className="mmu-path-label">?</text>}
        {data.sensors.map((sensor) => <g key={sensor.name} data-sensor={sensor.name} data-detected={String(sensor.detected)}>
          <title>{labels[sensor.name]}: {sensorState(sensor.detected)}</title>
          <circle cx="33" cy={positions[sensor.name]} r="3.5" className={sensor.detected === true ? "mmu-path-sensor detected" : sensor.detected === false ? "mmu-path-sensor empty" : "mmu-path-sensor unknown"} />
          <text x="44" y={positions[sensor.name] + 3} className="mmu-path-label">{labels[sensor.name]}</text>
        </g>)}
        {data.encoder && <g className={data.encoder.enabled ? "" : "mmu-path-disabled"}>
          <circle cx="33" cy="81" r="3" className="mmu-path-outline" fill="var(--panel)" />
          <text x="44" y="84" className="mmu-path-small">Encoder {data.encoder.position === null ? "?" : `${new Intl.NumberFormat(es ? "es" : "en", { notation: "compact", maximumFractionDigits: 0 }).format(data.encoder.position)} mm`}</text>
        </g>}
        {data.hasBuffer && <g className={data.bufferActive ? "" : "mmu-path-disabled"} data-feedback={data.feedback}>
          <rect x="23" y="102" width="20" height="29" rx="2" className="mmu-path-buffer" />
          <g className="mmu-path-piston" style={{ transform: `translateY(${data.displacement * 8}px)` }} data-bias={data.displacement}>
            <rect x="26" y="97" width="14" height="24" rx="1" className="mmu-path-buffer" />
            <line x1="26" x2="40" y1="121" y2="121" className="mmu-path-outline" />
          </g>
          {(!data.bufferActive || data.feedback !== "unknown") && <text x="48" y="119" className="mmu-path-label">{bufferLabel}</text>}
          {data.bias !== null && <text x="18" y="119" textAnchor="end" className="mmu-path-bias">{Math.max(-1, Math.min(1, data.bias)).toFixed(2)}</text>}
        </g>}
      </svg>
    </figure>
  </RichTooltip>;
}

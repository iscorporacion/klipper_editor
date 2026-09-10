export type PidSample = { time: number; temperature: number; target: number; power?: number };

export default function PidChart({ samples, label }: { samples: PidSample[]; label: string }) {
  const start = samples[0]?.time ?? Date.now();
  const duration = Math.max(60000, (samples.at(-1)?.time ?? start) - start);
  const max = Math.max(50, Math.ceil(Math.max(...samples.map((s) => Math.max(s.temperature, s.target)), 0) / 25) * 25);
  const x = (time: number) => 48 + (time - start) / duration * 600;
  const y = (value: number) => 230 - value / max * 200;
  return <svg className="pid-chart" viewBox="0 0 700 270" role="img" aria-label={label}>
    <text x="48" y="17">°C</text><text x="648" y="17" textAnchor="end">PWM %</text>
    {[0, 1, 2, 3, 4].map((step) => <g key={step}>
      <line x1="48" x2="648" y1={230 - step * 50} y2={230 - step * 50} className="pid-grid" />
      <text x="40" y={234 - step * 50} textAnchor="end">{Math.round(max * step / 4)}</text>
      <text x="656" y={234 - step * 50}>{step * 25}</text>
      <line x1={48 + step * 150} x2={48 + step * 150} y1="30" y2="230" className="pid-grid" />
      <text x={48 + step * 150} y="254" textAnchor="middle">{new Date(start + duration * step / 4).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</text>
    </g>)}
    <polyline fill="none" stroke="#efb85c" strokeDasharray="6 4" strokeWidth="2" points={samples.map((s) => `${x(s.time)},${y(s.target)}`).join(" ")} />
    <polyline fill="none" stroke="#63c9ff" strokeWidth="2" points={samples.map((s) => `${x(s.time)},${y(s.temperature)}`).join(" ")} />
    {samples.map((s, i) => i > 0 && s.power !== undefined && samples[i - 1].power !== undefined
      ? <line key={`${s.time}-${i}`} stroke="#cf8fee" strokeWidth="1.5" x1={x(samples[i - 1].time)} x2={x(s.time)} y1={230 - samples[i - 1].power! * 200} y2={230 - s.power * 200} /> : null)}
  </svg>;
}

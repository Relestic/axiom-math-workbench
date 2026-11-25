import { formatNumber } from "../scene/functionScene";

export function Range({
  label,
  value,
  min,
  max,
  step,
  change,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  change: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="fw-slider">
      <span>
        {label}
        <b>{formatNumber(value)}</b>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => change(Number(event.target.value))}
      />
      <small>
        {min} <span>{max}</span>
      </small>
    </label>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="fw-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

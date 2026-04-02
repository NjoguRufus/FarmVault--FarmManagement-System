export function formatKes(value: number, opts?: { fractionDigits?: number }): string {
  const digits = opts?.fractionDigits ?? 0;
  return `KES ${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatKg(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

export function formatCrates(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} crates`;
}

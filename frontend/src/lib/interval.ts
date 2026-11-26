/** Decimal bounds such as -0.03 and -0.02 can subtract to just below 0.01. */
export function hasMinimumSpan(min: number, max: number, minimum: number) {
  const roundoff = Number.EPSILON * Math.max(minimum, Math.abs(min), Math.abs(max));
  return max - min >= minimum - roundoff;
}

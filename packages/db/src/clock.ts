/** The one source of "now". `TMC_NOW` (ISO string) pins time for demos and tests; never set it in production. */
export function now(): Date {
  const fixed = process.env.TMC_NOW;
  if (!fixed) return new Date();
  const d = new Date(fixed);
  if (Number.isNaN(d.getTime())) throw new Error(`TMC_NOW is not a valid date: ${fixed}`);
  return d;
}

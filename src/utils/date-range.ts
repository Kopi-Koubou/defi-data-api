const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateRange {
  from: Date;
  to: Date;
}

export function resolveDateRange(
  fromIso: string | undefined,
  toIso: string | undefined,
  defaultDays: number
): DateRange {
  const to = toIso ? new Date(toIso) : new Date();
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - defaultDays * DAY_MS);

  return { from, to };
}

export function isDateRangeValid(range: DateRange): boolean {
  return range.from <= range.to;
}

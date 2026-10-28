function isFullWidth(item: unknown): boolean {
  return typeof item === 'object' && item !== null && 'fullWidth' in item && Boolean((item as { fullWidth?: boolean }).fullWidth);
}

/** `fullWidth` satırı böler. Diğerleri geliş sırasıyla aynı satırda kalır. */
export function groupDashboardGraphs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let open: T[] = [];
  const flush = () => {
    if (open.length === 0) return;
    rows.push(open);
    open = [];
  };
  for (const item of items) {
    if (isFullWidth(item)) {
      flush();
      rows.push([item]);
    } else {
      open.push(item);
    }
  }
  flush();
  return rows;
}

/** `fullWidth` satırı böler. Diğerleri geliş sırasıyla aynı satırda kalır. */
export function groupDashboardGraphs<T extends { fullWidth?: boolean }>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let open: T[] = [];
  const flush = () => {
    if (open.length === 0) return;
    rows.push(open);
    open = [];
  };
  for (const item of items) {
    if (item.fullWidth) {
      flush();
      rows.push([item]);
    } else {
      open.push(item);
    }
  }
  flush();
  return rows;
}

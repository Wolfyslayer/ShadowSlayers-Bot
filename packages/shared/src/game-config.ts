export function normalizeGameLabels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const label = item.trim();
    const normalized = label.toLowerCase();
    if (label.length < 1 || label.length > 50 || seen.has(normalized)) return null;
    labels.push(label);
    seen.add(normalized);
  }
  return labels;
}

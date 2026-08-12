interface CompletionProgress {
  done: number;
  total: number;
}

/** A safe percentage for progress meters, including empty collections. */
export function completionPercentage({
  done,
  total,
}: CompletionProgress): number {
  return total === 0 ? 0 : (done / total) * 100;
}

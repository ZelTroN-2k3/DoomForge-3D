/** Preserve project precision while yielding between bounded buffer-copy chunks. */
export async function copySculptNumbers<T extends number[] | Float64Array>(
  source: ArrayLike<number>,
  destination: T,
  isCancelled: () => boolean = () => false,
): Promise<T | null> {
  let lastYield = performance.now();
  for (let offset = 0; offset < source.length; offset += 16_384) {
    if (isCancelled()) return null;
    const end = Math.min(source.length, offset + 16_384);
    for (let index = offset; index < end; index += 1) destination[index] = source[index];
    if (performance.now() - lastYield >= 4 && end < source.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
    }
  }
  return isCancelled() ? null : destination;
}

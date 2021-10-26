import invariant from "tiny-invariant";

/**
 * given an array of items sorted by `comparator`, insert an item into its sort index and constrain the size to
 * `maxSize` by removing the last item
 *
 * @param items
 * @param add
 * @param maxSize
 * @param comparator
 * @returns
 */
export function sortedInsert<T>(
  items: T[],
  add: T,
  maxSize: number,
  comparator: (a: T, b: T) => number
): T | null {
  invariant(maxSize > 0, "MAX_SIZE_ZERO");
  // this is an invariant because the interface cannot return multiple removed items if items.length exceeds maxSize
  invariant(items.length <= maxSize, "ITEMS_SIZE");

  // short circuit first item add
  if (items.length === 0) {
    items.push(add);
    return null;
  } else {
    const isFull = items.length === maxSize;
    // short circuit if full and the additional item does not come before the last item
    const lastItem = items[items.length - 1];
    invariant(lastItem, "LAST_ITEM");
    if (isFull && comparator(lastItem, add) <= 0) {
      return add;
    }

    let lo = 0,
      hi = items.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midItem = items[mid];
      invariant(midItem, "MID_ITEM");
      if (comparator(midItem, add) <= 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    items.splice(lo, 0, add);
    return isFull ? items.pop() ?? null : null;
  }
}

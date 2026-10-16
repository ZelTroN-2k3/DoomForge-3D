export function hasOneToOneCadComponentMapping(sourceCount: number, componentOwners: number[]) {
  if (!Number.isInteger(sourceCount) || sourceCount < 2 || componentOwners.length !== sourceCount) {
    return false;
  }

  const owners = new Set<number>();
  for (const owner of componentOwners) {
    if (!Number.isInteger(owner) || owner < 0 || owner >= sourceCount || owners.has(owner)) {
      return false;
    }
    owners.add(owner);
  }
  return owners.size === sourceCount;
}

export function closedCadSolidComponents<T>(shape: T, isSolid: (candidate: T) => boolean, getSolids: (candidate: T) => T[]) {
  return isSolid(shape) ? [shape] : getSolids(shape);
}

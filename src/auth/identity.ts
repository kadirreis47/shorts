let validatedOwnerId: string | null = null;
let validatedOwnerGeneration = 0;

export function setValidatedOwnerId(ownerId: string | null) { validatedOwnerId = ownerId; }
export function getValidatedOwnerId() { return validatedOwnerId; }

/** Incremented only when the private runtime detaches from one owner for another. */
export function advanceValidatedOwnerGeneration() {
  validatedOwnerGeneration += 1;
  return validatedOwnerGeneration;
}

export function getValidatedOwnerGeneration() { return validatedOwnerGeneration; }

export function isCurrentValidatedOwnerContext(ownerId: string, generation: number) {
  return validatedOwnerId === ownerId && validatedOwnerGeneration === generation;
}

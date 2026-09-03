/** Canonical project-scene identity. The historical prefix is an opaque wire format. */
export const CANONICAL_SCENE_ID_PATTERN = /^visual-scene-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SceneIdentityInput {
  readonly sceneId?: unknown;
  /** Hydration-only legacy identity. Never emitted by canonical normalization. */
  readonly visualPlanningId?: unknown;
}

export type CanonicalSceneIdentity<T extends object> =
  Omit<T, 'sceneId' | 'visualPlanningId'> & { readonly sceneId: string };

export function isCanonicalSceneId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_SCENE_ID_PATTERN.test(value);
}

export function createCanonicalSceneId(): string {
  return `visual-scene-${crypto.randomUUID()}`;
}

/** Assigns fresh identities to a newly created logical scene collection. */
export function assignNewCanonicalSceneIds<T extends object>(
  scenes: readonly T[],
): Array<CanonicalSceneIdentity<T>> {
  const claimed = new Set<string>();
  return scenes.map((scene) => {
    const sceneId = createUniqueId(new Set(), claimed);
    claimed.add(identityKey(sceneId));
    const { sceneId: _sceneId, visualPlanningId: _visualPlanningId, ...rest } = scene as T & SceneIdentityInput;
    return { ...rest, sceneId } as CanonicalSceneIdentity<T>;
  });
}

/**
 * Materializes exactly one valid, unique canonical identity per scene. Existing
 * canonical IDs win; a valid legacy visual ID is promoted without changing its
 * value. Duplicate canonical IDs are never allowed to alias two scenes.
 */
export function materializeCanonicalSceneIds<T extends object>(
  scenes: readonly T[],
): Array<CanonicalSceneIdentity<T>> {
  const canonicalOwners = new Map<string, number>();
  scenes.forEach((scene, index) => {
    const canonical = validId((scene as SceneIdentityInput).sceneId);
    if (canonical && !canonicalOwners.has(identityKey(canonical))) canonicalOwners.set(identityKey(canonical), index);
  });
  const legacyOwners = new Map<string, number>();
  scenes.forEach((scene, index) => {
    const identity = scene as SceneIdentityInput;
    const legacy = validId(identity.visualPlanningId);
    if (!validId(identity.sceneId) && legacy && !canonicalOwners.has(identityKey(legacy)) && !legacyOwners.has(identityKey(legacy))) {
      legacyOwners.set(identityKey(legacy), index);
    }
  });
  const reservedIds = new Set([...canonicalOwners.keys(), ...legacyOwners.keys()]);
  const claimed = new Set<string>();
  return scenes.map((scene, index) => {
    const identity = scene as SceneIdentityInput;
    const canonical = validId(identity.sceneId);
    const legacy = validId(identity.visualPlanningId);
    let sceneId = canonical && canonicalOwners.get(identityKey(canonical)) === index
      ? canonical
      : canonical
        ? createUniqueId(reservedIds, claimed)
        : legacy && legacyOwners.get(identityKey(legacy)) === index
          ? legacy
          : createUniqueId(reservedIds, claimed);
    if (claimed.has(identityKey(sceneId))) sceneId = createUniqueId(reservedIds, claimed);
    claimed.add(identityKey(sceneId));
    const { sceneId: _sceneId, visualPlanningId: _visualPlanningId, ...rest } = scene as T & SceneIdentityInput;
    return { ...rest, sceneId } as CanonicalSceneIdentity<T>;
  });
}

export function hasUniqueCanonicalSceneIds(scenes: readonly SceneIdentityInput[]): boolean {
  const ids = scenes.map((scene) => validId(scene.sceneId));
  return ids.every((id): id is string => Boolean(id)) && new Set(ids.map(identityKey)).size === ids.length;
}

function validId(value: unknown): string | null {
  return isCanonicalSceneId(value) ? value : null;
}

function identityKey(value: string): string { return value.toLowerCase(); }

function createUniqueId(reserved: ReadonlySet<string>, claimed: ReadonlySet<string>): string {
  let id = createCanonicalSceneId().toLowerCase();
  while (reserved.has(id) || claimed.has(id)) id = createCanonicalSceneId().toLowerCase();
  return id;
}

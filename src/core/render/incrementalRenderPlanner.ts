import type { RenderManifest } from '@/core/media';
import type {
  IncrementalRenderPlan,
  IncrementalRenderSnapshot,
  SceneRenderPlanItem,
} from './incrementalTypes';
import { createSceneFingerprint } from './sceneFingerprint';
import type { RenderPreset } from './types';
import { readUserScopedLocalStorage, writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';

export interface IncrementalRenderPlanner {
  createPlan(input: {
    manifest: RenderManifest;
    preset: RenderPreset;
    adapterId: string;
    forceRender?: boolean;
  }): Promise<IncrementalRenderPlan>;
  commit(input: {
    plan: IncrementalRenderPlan;
    adapterId: string;
    presetId: string;
    outputUri: string;
  }): void;
  clear(projectId?: string): void;
}

const STORAGE_KEY = 'shortsflow.incremental-render.v1';
const MAX_PROJECTS = 30;

export function createIncrementalRenderPlanner(): IncrementalRenderPlanner {
  let snapshots = loadSnapshots();

  return {
    async createPlan({ manifest, preset, adapterId, forceRender = false }) {
      // Private-image authority is verified only at the native FFmpeg boundary.
      // Never satisfy such a render exclusively from renderer-addressable cache.
      const requiresNativeImageAuthority = (manifest.assets ?? []).some((asset) => asset.type === 'image')
        || manifest.timeline.scenes.some((scene) => Boolean(
          scene.imageGeometryAuthority
          || (scene.sourceScene?.imageStorage || scene.sourceScene?.imageUrl)
            && !scene.sourceScene.videoStorage && !scene.sourceScene.videoUrl,
        ));
      const effectiveForceRender = forceRender || requiresNativeImageAuthority;
      const previous = snapshots.find(
        (snapshot) =>
          snapshot.projectId === manifest.projectId &&
          snapshot.adapterId === adapterId &&
          snapshot.presetId === preset.id,
      );

      const rawItems: SceneRenderPlanItem[] = [];
      for (const scene of manifest.timeline.scenes) {
        const fingerprint = await createSceneFingerprint(scene, manifest, preset);
        const previousFingerprint =
          previous?.sceneFingerprints[scene.id] ?? null;
        const unchanged =
          !effectiveForceRender &&
          previousFingerprint !== null &&
          previousFingerprint === fingerprint;

        rawItems.push({
          sceneId: scene.id,
          sceneIndex: scene.index,
          fingerprint,
          previousFingerprint,
          decision: unchanged ? 'reuse' : 'render',
          reason: effectiveForceRender
            ? 'Tam render zorlandı'
            : previousFingerprint === null
              ? 'Önceki sahne çıktısı bulunamadı'
              : unchanged
                ? 'Sahne içeriği ve render bağımlılıkları değişmedi'
                : 'Sahne fingerprint değeri değişti',
          durationMs: scene.durationMs,
          estimatedFrames: Math.ceil(
            (scene.durationMs / 1000) * manifest.render.fps,
          ),
        });
      }

      const items = applyTransitionDependencies(rawItems, manifest);
      const rendered = items.filter((item) => item.decision !== 'reuse');
      const reusable = items.filter((item) => item.decision === 'reuse');
      const dependency = items.filter(
        (item) => item.decision === 'render-dependency',
      );
      const estimatedFrames = items.reduce(
        (total, item) => total + item.estimatedFrames,
        0,
      );
      const reusableFrames = reusable.reduce(
        (total, item) => total + item.estimatedFrames,
        0,
      );

      return {
        projectId: manifest.projectId,
        planId: createId('incremental-plan'),
        createdAt: new Date().toISOString(),
        fullRenderRequired:
          effectiveForceRender || previous === undefined || reusable.length === 0,
        changedSceneIds: items
          .filter((item) => item.decision === 'render')
          .map((item) => item.sceneId),
        reusableSceneIds: reusable.map((item) => item.sceneId),
        dependencySceneIds: dependency.map((item) => item.sceneId),
        items,
        totalScenes: items.length,
        renderedScenes: rendered.length,
        reusableScenes: reusable.length,
        estimatedFrames,
        reusableFrames,
        estimatedSavedPercent:
          estimatedFrames > 0
            ? Math.round((reusableFrames / estimatedFrames) * 100)
            : 0,
      };
    },

    commit({ plan, adapterId, presetId, outputUri }) {
      const snapshot: IncrementalRenderSnapshot = {
        projectId: plan.projectId,
        adapterId,
        presetId,
        sceneFingerprints: Object.fromEntries(
          plan.items.map((item) => [item.sceneId, item.fingerprint]),
        ),
        outputUri,
        completedAt: new Date().toISOString(),
      };

      snapshots = [
        snapshot,
        ...snapshots.filter(
          (existing) =>
            !(
              existing.projectId === snapshot.projectId &&
              existing.adapterId === snapshot.adapterId &&
              existing.presetId === snapshot.presetId
            ),
        ),
      ].slice(0, MAX_PROJECTS);
      persistSnapshots(snapshots);
    },

    clear(projectId) {
      snapshots = projectId
        ? snapshots.filter((snapshot) => snapshot.projectId !== projectId)
        : [];
      persistSnapshots(snapshots);
    },
  };
}

function applyTransitionDependencies(
  items: SceneRenderPlanItem[],
  manifest: RenderManifest,
): SceneRenderPlanItem[] {
  const changedIndexes = new Set(
    items
      .filter((item) => item.decision === 'render')
      .map((item) => item.sceneIndex),
  );

  return items.map((item) => {
    if (item.decision === 'render') return item;

    const scene = manifest.timeline.scenes[item.sceneIndex];
    const previousChanged = changedIndexes.has(item.sceneIndex - 1);
    const nextChanged = changedIndexes.has(item.sceneIndex + 1);
    const hasOverlap =
      scene.overlapBeforeMs > 0 ||
      scene.overlapAfterMs > 0 ||
      scene.transition.type !== 'cut';

    if (hasOverlap && (previousChanged || nextChanged)) {
      return {
        ...item,
        decision: 'render-dependency',
        reason:
          'Komşu sahne değişti ve geçiş/overlap bağımlılığı yeniden render gerektiriyor',
      };
    }

    return item;
  });
}

function loadSnapshots(): IncrementalRenderSnapshot[] {
  try {
    const raw = readUserScopedLocalStorage(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSnapshots(
  snapshots: IncrementalRenderSnapshot[],
): void {
  try {
    writeUserScopedLocalStorage(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Planner persistence failure must not block rendering.
  }
}

function createId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V1_VIEW_KEYS, isV1EdgeFunction, resolveV1View } from '@/app/v1Features';
import { VIEW_REGISTRY } from '@/app/viewRegistry';
import { useUIStore } from '@/store/uiStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ShortsFlow V1 feature allowlist', () => {
  afterEach(() => {
    useUIStore.setState({ currentView: 'dashboard' });
  });

  it('keeps only approved V1 views in navigation and the production registry', () => {
    const navigation = readFileSync('src/app/navigation.tsx', 'utf8');
    const navigationKeys = [...navigation.matchAll(/\{ key: '([^']+)'/g)].map((match) => match[1]);

    expect(navigationKeys).toEqual([...V1_VIEW_KEYS]);
    expect(Object.keys(VIEW_REGISTRY)).toEqual(expect.arrayContaining([...V1_VIEW_KEYS]));
    expect(Object.keys(VIEW_REGISTRY)).toHaveLength(V1_VIEW_KEYS.length);
    expect(VIEW_REGISTRY).not.toHaveProperty('automation');
    expect(VIEW_REGISTRY).not.toHaveProperty('crossplatform');
    expect(VIEW_REGISTRY).not.toHaveProperty('platform-studio');
  });

  it('fails closed for direct, restored, and programmatic deferred routes', () => {
    for (const deferredView of ['automation', 'workflow', 'faceless', 'crossplatform', 'platform-studio']) {
      expect(resolveV1View(deferredView)).toBe('dashboard');
    }

    useUIStore.getState().navigate('automation');
    expect(useUIStore.getState().currentView).toBe('dashboard');

    const viewHost = readFileSync('src/app/ViewHost.tsx', 'utf8');
    const uiStore = readFileSync('src/store/uiStore.ts', 'utf8');
    expect(viewHost).toContain('VIEW_REGISTRY[resolveV1View(view)]');
    expect(uiStore).toContain('currentView: resolveV1View(persisted?.currentView)');
  });

  it('keeps the active Studio-to-publishing route chain available', () => {
    for (const view of [
      'studio',
      'director',
      'editor',
      'audio-studio',
      'visual-studio',
      'subtitle-studio',
      'export-studio',
      'publishing-studio',
    ]) {
      expect(resolveV1View(view)).toBe(view);
      expect(VIEW_REGISTRY).toHaveProperty(view);
    }
  });

  it('allows only the approved V1 Edge Function names', () => {
    for (const functionName of [
      'provider-status',
      'generate-script',
      'generate-image',
      'generate-voiceover',
      'research-footage',
      'translate-subtitles',
      'resolve-image-display-geometry',
    ]) {
      expect(isV1EdgeFunction(functionName)).toBe(true);
    }

    for (const functionName of [
      'youtube-auth',
      'youtube-publish',
      'auto-clip',
      'clone-voice',
      'cross-platform-adapt',
      'revenue-forecast',
    ]) {
      expect(isV1EdgeFunction(functionName)).toBe(false);
    }
  });
});

describe('ViewHost direct-route guard', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    vi.resetModules();
  });

  it('does not mount a deferred view requested directly', async () => {
    vi.doMock('@/app/viewRegistry', () => ({
      VIEW_REGISTRY: {
        dashboard: () => <div>Supported dashboard</div>,
      },
    }));
    const { ViewHost } = await import('@/app/ViewHost');

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <ViewHost
          view="automation"
          channels={[]}
          productionChannels={[]}
          onNavigate={() => undefined}
        />,
      );
    });

    expect(host.textContent).toBe('Supported dashboard');
  });
});

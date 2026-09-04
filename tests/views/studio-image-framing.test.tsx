import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageFramingPreview } from '@/components/studio/ImageFramingPreview';
import type { ImageFramingV1 } from '@/core/media/imageFraming';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio manual image framing preview', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('renders the applied crop with the canonical crop-window geometry', () => {
    act(() => root.render(<ImageFramingPreview
      src="https://example.test/image.jpg"
      displayDimensions={{ width: 200, height: 100 }}
      outputDimensions={{ width: 100, height: 100 }}
      framing={{ version: 1, mode: 'focal-cover', anchor: { x: 0, y: 0.5 } }}
    />));
    const image = host.querySelector('img')!;
    expect(image.style.width).toBe('200%');
    expect(image.style.left).toBe('0%');
    expect(image.style.top).toBe('0%');
  });

  it('maps a landscape crop viewport into full display-oriented source space', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview
      src="https://example.test/image.jpg"
      displayDimensions={{ width: 200, height: 100 }}
      outputDimensions={{ width: 100, height: 100 }}
      editable
      onChange={onChange}
    />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 7, 10, 50)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 0.3, y: 0.5 } });
  });

  it('maps a portrait crop viewport into full display-oriented source space', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview
      src="image.jpg"
      displayDimensions={{ width: 100, height: 200 }}
      outputDimensions={{ width: 100, height: 100 }}
      editable
      onChange={onChange}
    />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 8, 50, 10)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 0.5, y: 0.3 } });
  });

  it('maps clicks through an existing non-center crop and clamps extreme drags', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview
      src="image.jpg"
      displayDimensions={{ width: 200, height: 100 }}
      outputDimensions={{ width: 100, height: 100 }}
      framing={{ version: 1, mode: 'focal-cover', anchor: { x: 0.8, y: 0.5 } }}
      editable
      onChange={onChange}
    />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 9, 10, 50)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 0.55, y: 0.5 } });
    act(() => preview.dispatchEvent(pointerEvent('pointermove', 9, -200, 300)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 0, y: 1 } });
    act(() => preview.dispatchEvent(pointerEvent('pointermove', 9, 300, -200)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 1, y: 0 } });
  });

  it('uses a stable drag crop origin across pending-state rerenders', () => {
    const observed: Array<unknown> = [];
    function Harness() {
      const [pending, setPending] = useState<ImageFramingV1 | undefined>();
      return <ImageFramingPreview
        src="image.jpg"
        displayDimensions={{ width: 200, height: 100 }}
        outputDimensions={{ width: 100, height: 100 }}
        framing={pending}
        editable
        onChange={(value) => { observed.push(value); setPending(value); }}
      />;
    }
    act(() => root.render(<Harness />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 10, 50, 50)));
    act(() => preview.dispatchEvent(pointerEvent('pointermove', 10, 60, 50)));
    act(() => preview.dispatchEvent(pointerEvent('pointermove', 10, 70, 50)));
    expect(observed.at(-1)).toEqual({ version: 1, mode: 'focal-cover', anchor: { x: 0.6, y: 0.5 } });
  });

  it('emits bounded pending framing without owning canonical scene state', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview
      src="https://example.test/image.jpg"
      displayDimensions={{ width: 100, height: 100 }}
      outputDimensions={{ width: 100, height: 100 }}
      editable
      onChange={onChange}
    />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 11, 10, 90)));
    expect(onChange).toHaveBeenLastCalledWith({ version: 1, mode: 'focal-cover', anchor: { x: 0.1, y: 0.9 } });
  });

  it('emits absence for exact center so Apply can remain a no-op/reset', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview src="image.jpg" displayDimensions={{ width: 100, height: 100 }} editable onChange={onChange} />));
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 12, 50, 50)));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders display-space focal and subject overlays without changing pointer behavior', () => {
    const onChange = vi.fn();
    act(() => root.render(<ImageFramingPreview
      src="image.jpg"
      displayDimensions={{ width: 200, height: 100 }}
      outputDimensions={{ width: 100, height: 100 }}
      framing={{ version: 1, mode: 'focal-cover', anchor: { x: 0.5, y: 0.5 } }}
      focalPoint={{ x: 0.5, y: 0.4 }}
      subjectRegion={{ x: 0.4, y: 0.2, width: 0.2, height: 0.5 }}
      onChange={onChange}
    />));
    const focal = host.querySelector('[data-testid="image-framing-focal-point"]') as HTMLSpanElement;
    const subject = host.querySelector('[data-testid="image-framing-subject-region"]') as HTMLSpanElement;
    expect(focal.style.left).toBe('50%');
    expect(focal.style.top).toBe('40%');
    expect(Number.parseFloat(subject.style.left)).toBeCloseTo(30);
    expect(Number.parseFloat(subject.style.width)).toBeCloseTo(40);
    const preview = host.querySelector('[data-testid="image-framing-preview"]') as HTMLDivElement;
    installPointerSurface(preview, 100, 100);
    act(() => preview.dispatchEvent(pointerEvent('pointerdown', 13, 25, 25)));
    expect(onChange).not.toHaveBeenCalled();
  });
});

function installPointerSurface(preview: HTMLDivElement, width: number, height: number): void {
  preview.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) });
  preview.setPointerCapture = vi.fn();
  preview.releasePointerCapture = vi.fn();
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

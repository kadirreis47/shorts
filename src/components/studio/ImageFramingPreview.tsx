import { useRef } from 'react';
import {
  deriveImageCoverCropWindow,
  imageFramingFromAnchor,
  type ImageFramingDimensions,
  type ImageFramingV1,
} from '@/core/media/imageFraming';

interface ImageFramingPreviewProps {
  readonly src: string;
  readonly displayDimensions: ImageFramingDimensions;
  readonly outputDimensions?: ImageFramingDimensions;
  readonly framing?: ImageFramingV1;
  readonly editable?: boolean;
  readonly onChange?: (framing: ImageFramingV1 | undefined) => void;
  readonly alt?: string;
  readonly className?: string;
}

/** Crop preview driven by the same normalized window used by native execution. */
export function ImageFramingPreview({
  src,
  displayDimensions,
  outputDimensions = { width: 1080, height: 1920 },
  framing,
  editable = false,
  onChange,
  alt = '',
  className = '',
}: ImageFramingPreviewProps) {
  const drag = useRef<{
    readonly pointerId: number;
    readonly pointerU: number;
    readonly pointerV: number;
    readonly sourceX: number;
    readonly sourceY: number;
    readonly cropWidth: number;
    readonly cropHeight: number;
  } | null>(null);
  const crop = deriveImageCoverCropWindow(displayDimensions, outputDimensions, framing);
  const anchor = framing?.anchor ?? { x: 0.5, y: 0.5 };
  const markerX = ((anchor.x - crop.x) / crop.width) * 100;
  const markerY = ((anchor.y - crop.y) / crop.height) * 100;

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      u: (event.clientX - bounds.left) / bounds.width,
      v: (event.clientY - bounds.top) / bounds.height,
    };
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = drag.current;
    const pointer = pointerPosition(event);
    if (!origin || !pointer || !onChange) return;
    onChange(imageFramingFromAnchor({
      x: clamp(origin.sourceX + (pointer.u - origin.pointerU) * origin.cropWidth),
      y: clamp(origin.sourceY + (pointer.v - origin.pointerV) * origin.cropHeight),
    }));
  };

  return (
    <div
      className={`relative overflow-hidden bg-slate-950 ${editable ? 'cursor-crosshair touch-none' : ''} ${className}`}
      style={{ aspectRatio: `${outputDimensions.width} / ${outputDimensions.height}` }}
      onPointerDown={(event) => {
        if (!editable || !onChange) return;
        const pointer = pointerPosition(event);
        if (!pointer) return;
        const pointerU = clamp(pointer.u);
        const pointerV = clamp(pointer.v);
        const sourceX = crop.x + pointerU * crop.width;
        const sourceY = crop.y + pointerV * crop.height;
        drag.current = {
          pointerId: event.pointerId,
          pointerU,
          pointerV,
          sourceX,
          sourceY,
          cropWidth: crop.width,
          cropHeight: crop.height,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(imageFramingFromAnchor({ x: sourceX, y: sourceY }));
      }}
      onPointerMove={(event) => { if (drag.current?.pointerId === event.pointerId) updateDrag(event); }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        updateDrag(event);
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      data-testid="image-framing-preview"
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
          left: `${-100 * crop.x / crop.width}%`,
          top: `${-100 * crop.y / crop.height}%`,
        }}
      />
      {editable && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-600 shadow"
          style={{ left: `${markerX}%`, top: `${markerY}%` }}
        />
      )}
    </div>
  );
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

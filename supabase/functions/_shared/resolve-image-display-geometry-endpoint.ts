import { handleResolveImageDisplayGeometryRequest } from './resolve-image-display-geometry-handler.ts';
import type { ResolveImageDisplayGeometryHandlerDependencies } from './resolve-image-display-geometry-handler.ts';

export function createResolveImageDisplayGeometryEndpoint(
  dependencies: ResolveImageDisplayGeometryHandlerDependencies,
): (req: Request) => Promise<Response> {
  return (req) => handleResolveImageDisplayGeometryRequest(req, dependencies);
}

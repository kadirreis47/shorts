type JsonResponseFactory = (body: Record<string, unknown>, status?: number) => Response;

export function createBoundedJsonReader(respond: JsonResponseFactory) {
  return async function readBoundedJson<T extends object>(
    req: Request,
    maxBytes: number,
  ): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
    if (!req.body) return { ok: false, response: respond({ error: 'Invalid request body.' }, 400) };

    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return { ok: false, response: respond({ error: 'Request body is too large.' }, 413) };
        }
        chunks.push(value);
      }

      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, response: respond({ error: 'Invalid request body.' }, 400) };
      }
      return { ok: true, value: parsed as T };
    } catch {
      return { ok: false, response: respond({ error: 'Invalid request body.' }, 400) };
    } finally {
      reader.releaseLock();
    }
  };
}

// Background-thread parsing: xlsx read + template detection stay off the UI
// thread so 20–50 MB files don't freeze the app. The client
// (`src/lib/parseClient.ts`) recreates the File from the transferred buffer;
// results are plain data and come back via structured clone.
import { parseBiometricFile, readSheetGrid } from '../lib/parser';
import type { ColumnMap } from '../lib/columns';

interface ParseRequest {
  id: number;
  kind: 'parse';
  buffer: ArrayBuffer;
  name: string;
  lastModified: number;
  map?: ColumnMap;
}

interface GridRequest {
  id: number;
  kind: 'grid';
  buffer: ArrayBuffer;
  name: string;
  lastModified: number;
}

type Request = ParseRequest | GridRequest;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (msg: unknown) => void;
};

scope.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    const file = new File([req.buffer], req.name, { lastModified: req.lastModified });
    if (req.kind === 'grid') {
      const preview = await readSheetGrid(file);
      scope.postMessage({ id: req.id, ok: true as const, preview });
    } else {
      const result = await parseBiometricFile(file, req.map);
      scope.postMessage({ id: req.id, ok: true as const, result });
    }
  } catch (err) {
    scope.postMessage({
      id: req.id,
      ok: false as const,
      message: err instanceof Error ? err.message : 'Background parse failed.',
    });
  }
};

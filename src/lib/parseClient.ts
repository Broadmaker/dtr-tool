// Worker-first parsing with transparent main-thread fallback.
//
// The happy path runs xlsx read + template detection in a Web Worker so
// large files don't freeze the UI. Any worker failure (unsupported browser,
// chunk load error, timeout, or a parse error) falls back to the exact same
// main-thread functions, preserving error messages for the column mapper.
import { parseBiometricFile, readSheetGrid } from './parser';
import type { ParseResult } from './parser';
import type { ColumnMap, SheetPreview } from './columns';

type WorkerRequest =
  | { id: number; kind: 'parse'; buffer: ArrayBuffer; name: string; lastModified: number; map?: ColumnMap }
  | { id: number; kind: 'grid'; buffer: ArrayBuffer; name: string; lastModified: number };

type WorkerResponse =
  | { id: number; ok: true; result?: ParseResult; preview?: SheetPreview }
  | { id: number; ok: false; message: string };

let nextId = 1;
/** Permanent construction failure (e.g. no Worker support) skips straight to main thread. */
let workerUnavailable = false;

const TIMEOUT_MS = 120_000;

function runInWorker(
  req:
    | Omit<Extract<WorkerRequest, { kind: 'parse' }>, 'id'>
    | Omit<Extract<WorkerRequest, { kind: 'grid' }>, 'id'>,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    if (workerUnavailable || typeof Worker === 'undefined') {
      reject(new Error('worker unavailable'));
      return;
    }
    let w: Worker;
    try {
      w = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      workerUnavailable = true;
      reject(new Error('worker unavailable'));
      return;
    }
    const id = nextId++;
    const timer = window.setTimeout(() => {
      w.terminate();
      reject(new Error('Background parse timed out.'));
    }, TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      w.terminate();
    };
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      done();
      resolve(e.data);
    };
    w.onerror = () => {
      done();
      reject(new Error('Background worker error.'));
    };
    // NOTE: no transfer list — the buffer stays usable for main-thread fallback.
    w.postMessage({ ...req, id });
  });
}

/** Parse a biometric file, preferring the background worker. */
export async function parseFile(file: File, map?: ColumnMap): Promise<ParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    const res = await runInWorker({
      kind: 'parse',
      buffer,
      name: file.name,
      lastModified: file.lastModified,
      map,
    });
    if (res.ok && res.result) return res.result;
    throw new Error(!res.ok ? res.message : 'Background parse failed.');
  } catch {
    return parseBiometricFile(file, map);
  }
}

/** Read the header grid for column mapping, preferring the background worker. */
export async function readGrid(file: File): Promise<SheetPreview> {
  try {
    const buffer = await file.arrayBuffer();
    const res = await runInWorker({
      kind: 'grid',
      buffer,
      name: file.name,
      lastModified: file.lastModified,
    });
    if (res.ok && res.preview) return res.preview;
    throw new Error(!res.ok ? res.message : 'Background read failed.');
  } catch {
    return readSheetGrid(file);
  }
}

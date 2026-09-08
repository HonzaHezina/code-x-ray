import { parentPort, workerData } from 'node:worker_threads';
import { analyzeRequest } from '../core/git';
import type { AnalysisRequest } from '../core/model';
analyzeRequest(workerData as AnalysisRequest).then(report => parentPort?.postMessage({ ok: true, report })).catch(error => parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }));

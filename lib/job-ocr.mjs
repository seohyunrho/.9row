import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_IMAGE_BYTES = 15_000_000;
const MAX_LINES = 5000;
const SCRIPT_PATH = fileURLToPath(new URL('../scripts/ocr-image.ps1', import.meta.url));
const MESSAGES = {
  unsupported: '이 컴퓨터에서는 이미지 글자 읽기를 사용할 수 없어요. Windows에서 다시 시도해 주세요.',
  unavailable: 'Windows의 이미지 글자 읽기 기능을 실행하지 못했어요.',
  language: 'Windows 한국어 글자 인식 기능이 설치되어 있지 않아요. 한국어 OCR 언어 기능을 설치한 뒤 다시 시도해 주세요.',
  dimensions: '공고 이미지가 너무 커서 글자를 읽지 못했어요. 원문 이미지에서 내용을 확인해 주세요.',
  decode: '공고 이미지 형식을 읽지 못했어요. 원문 이미지를 확인해 주세요.',
  timeout: '공고 이미지의 글자 읽기가 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.',
  empty: '공고 이미지에서 읽을 수 있는 글자를 찾지 못했어요. 원문 이미지를 확인해 주세요.',
  output: '이미지에서 읽은 글이 너무 길어 보관하지 못했어요.',
  recognize: '공고 이미지의 글자를 읽지 못했어요. 원문 이미지를 확인해 주세요.',
};

function problem(code) {
  const error = new Error(MESSAGES[code] || MESSAGES.recognize);
  error.status = 422;
  error.code = `JOB_OCR_${code.toUpperCase()}`;
  return error;
}

function runPowerShell(imagePath) {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-ImagePath', imagePath], {
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 3_000_000,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error?.killed) return reject(problem('timeout'));
      if (error?.code === 'ENOENT') return reject(problem('unavailable'));
      if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return reject(problem('output'));
      let result;
      try { result = JSON.parse(String(stdout || '').replace(/^\uFEFF/, '').trim()); }
      catch { return reject(problem('unavailable')); }
      if (error || result?.ok !== true) return reject(problem(Object.hasOwn(MESSAGES, result?.code) ? result.code : 'recognize'));
      if (typeof result.text !== 'string' || result.text.length > 250_000 || !result.text.trim() ||
          !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1 ||
          result.width > 10_000 || result.height > 60_000 || result.width * result.height > 80_000_000) {
        return reject(problem(result?.text?.length > 250_000 ? 'output' : 'recognize'));
      }
      if (!Array.isArray(result.lines) || result.lines.length < 1 || result.lines.length > MAX_LINES ||
          result.lines.some(line => !line || typeof line !== 'object' || Array.isArray(line) ||
            typeof line.text !== 'string' || !line.text.trim() || line.text.length > 250_000 ||
            ![line.x, line.y, line.width, line.height].every(Number.isFinite) ||
            line.x < 0 || line.y < 0 || line.width <= 0 || line.height <= 0 ||
            line.x + line.width > result.width || line.y + line.height > result.height)) {
        return reject(problem('recognize'));
      }
      const lines = result.lines.map(({ text, x, y, width, height }) => ({ text, x, y, width, height }));
      const rules = Array.isArray(result.rules) && result.rules.length <= 1000 ? result.rules.filter(rule =>
        ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rule?.[key]) && rule[key] >= 0)
        && rule.width > 0 && rule.height > 0 && rule.x + rule.width <= result.width && rule.y + rule.height <= result.height) : [];
      if (lines.map(line => line.text).join('\n').trim() !== result.text.trim()) return reject(problem('recognize'));
      resolve({ text: result.text.trim(), engine: 'windows-ocr', language: 'ko', width: result.width, height: result.height, lines, rules });
    });
  });
}

export async function recognizeImageText(bytes) {
  if (process.platform !== 'win32') throw problem('unsupported');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES) throw problem('dimensions');
  const tempRoot = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, 'moa-job-ocr-'));
  const resolvedDirectory = path.resolve(directory);
  // Only the exact directory returned by mkdtemp may be removed, never its parent.
  const ownsDirectory = path.dirname(resolvedDirectory) === tempRoot && path.basename(resolvedDirectory).startsWith('moa-job-ocr-');
  if (!ownsDirectory) throw problem('unavailable');
  try {
    const imagePath = path.join(resolvedDirectory, 'source-image');
    await writeFile(imagePath, bytes, { flag: 'wx' });
    return await runPowerShell(imagePath);
  } finally {
    await rm(resolvedDirectory, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
  }
}

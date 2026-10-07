import { DatabaseSync } from 'node:sqlite';
import { initialState, validateState, applyCapture } from './domain.mjs';
import { normalizeProfile } from './profile.mjs';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)');
  const readRow = db.prepare('SELECT revision, data FROM workspaces WHERE id = ?');
  const update = db.prepare('UPDATE workspaces SET revision = revision + 1, data = ? WHERE id = ? AND revision = ?');
  function read(workspace) {
    if (!['personal', 'demo'].includes(workspace)) throw new Error('사무실을 찾을 수 없습니다.');
    let row = readRow.get(workspace);
    if (!row) { db.prepare('INSERT INTO workspaces VALUES (?, 0, ?)').run(workspace, JSON.stringify(initialState(workspace === 'demo'))); row = readRow.get(workspace); }
    const data=JSON.parse(row.data);
    data.profile=normalizeProfile(data.profile);
    return { revision: row.revision, data };
  }
  function write(workspace, data, revision) {
    validateState(data);
    read(workspace);
    const result = update.run(JSON.stringify(data), workspace, revision);
    if (result.changes !== 1) { const e = new Error('다른 창에서 자료가 변경되었습니다. 현재 입력을 복사한 뒤 새로고침해 주세요.'); e.status = 409; throw e; }
    return read(workspace);
  }
  function capture(event) {
    const { data, revision } = read('demo');
    const recordId = applyCapture(data, event);
    write('demo', data, revision);
    return recordId;
  }
  return { read, write, capture, close: () => db.close() };
}

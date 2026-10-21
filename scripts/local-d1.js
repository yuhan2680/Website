import {DatabaseSync} from 'node:sqlite';

// Used only by Node tests and the loopback preview, never by Pages Functions.
export function localDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql, args = []) {
    return {
      bind(...values) { return prepare(sql, values); },
      async all() { return {results:sqlite.prepare(sql).all(...args)}; },
      async run() { return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}; }
    };
  }
  let pending = Promise.resolve();
  const binding = {prepare, batch(statements) {
    // D1 batches are serial transactions, including across concurrent requests.
    const task = pending.then(async () => {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    pending = task.catch(() => {});
    return task;
  }};
  return {sqlite,binding};
}

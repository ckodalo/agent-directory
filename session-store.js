import session from 'express-session';
import { query, transaction, parameter as p } from './database.js';

export class DatabaseSessionStore extends session.Store {
  get(id, callback) {
    query(`SELECT session_json FROM sessions WHERE session_id=${p('id')} AND expires_at>${p('now')}`, { id, now: Date.now() / 1000 })
      .then(rows => callback(null, rows[0] ? JSON.parse(rows[0].session_json) : null)).catch(callback);
  }
  set(id, value, callback = () => {}) {
    const expires = value.cookie.expires ? new Date(value.cookie.expires).getTime() / 1000 : Date.now() / 1000 + 28800;
    transaction(async run => {
      await run(`DELETE FROM sessions WHERE session_id=${p('id')}`, { id });
      await run(`INSERT INTO sessions(session_id,session_json,expires_at) VALUES (${p('id')},${p('json')},${p('expires')})`, { id, json: JSON.stringify(value), expires });
      await run(`DELETE FROM sessions WHERE expires_at<${p('now')}`, { now: Date.now() / 1000 });
    }).then(() => callback()).catch(callback);
  }
  destroy(id, callback = () => {}) {
    query(`DELETE FROM sessions WHERE session_id=${p('id')}`, { id }).then(() => callback()).catch(callback);
  }
}

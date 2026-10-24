'use strict';
/*
 * Modes without a running Hostwerk: a small fake host (settings, process registry, services) – create, switch (start
 * what belongs, stop the rest, databases first), own sidebar with the user's choice restored, release on removal.
 */
const test = require('node:test');
const assert = require('node:assert');
const { Modes } = require('../server/profiles');

function fakeHost() {
  const settings = { general: { ui: { hidden: ['mc'] } } };
  const procs = new Map();
  const proc = (id) => { const p = { id, state: 'stopped', isRunning: () => p.state === 'running', stop: async () => { p.state = 'stopped'; } }; procs.set(id, p); return p; };
  const order = [];
  const starter = (id) => async () => { order.push(id); procs.get(id).state = 'running'; };
  ['web1', 'db1'].forEach(proc);
  const mail = proc('mail');
  const ctx = {
    settings: { get: () => settings, save: () => {} },
    web: { list: () => [{ id: 'web1', name: 'Apache' }], start: (id) => starter(id)() },
    dbm: { list: () => [{ id: 'db1', name: 'MariaDB' }], start: (id) => starter(id)() },
    services: { mail: { proc: mail, start: starter('mail') } },
    minecraft: null, apps: null, mailserver: null, ai: null,
  };
  const host = { ctx, t: (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v || {})[k]), core: (n) => (n === 'proc' ? { registry: procs } : { broadcast: () => {} }) };
  return { host, settings, procs, order };
}

test('create, switch and end a mode', async () => {
  const { host, settings, procs, order } = fakeHost();
  const m = new Modes(host);
  const work = m.save({ name: 'Work', services: ['web1', 'db1', 'unknown'], hidden: ['mail'] }).list[0];
  assert.deepStrictEqual(work.services, ['web1', 'db1'], 'unknown services are dropped');
  assert.throws(() => m.save({ name: 'work' }), /already/);
  procs.get('mail').state = 'running';
  const r = await m.activate(work.id);
  assert.deepStrictEqual(order, ['db1', 'web1'], 'databases start before web servers');
  assert.deepStrictEqual(r.stopped, ['Mail catcher'], 'what does not belong stops');
  assert.deepStrictEqual(settings.general.ui.hidden, ['mail'], 'own sidebar applies');
  assert.strictEqual(m.activeProfile().id, work.id, 'autostart follows the active mode');
  m.release();
  assert.strictEqual(m.activeProfile(), null, 'removing the extension ends the mode');
  assert.deepStrictEqual(settings.general.ui.hidden, ['mc'], "the user's own sidebar comes back");
  assert.strictEqual(settings.profiles.list.length, 1, 'the modes themselves stay');
});

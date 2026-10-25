'use strict';
/*
 * One click, part “Tasks” (until 1.5 the extension “Quick tasks”, merged with SDK 3.8 "replaces"): favourite tasks show up
 * one by one in Hostwerk's “New” menu (“Run task “Backup””, SDK 2.10 host.setNewEntries). Favourites are Hostwerk's own
 * now (settings.general.ui.favorites.task – the same star as in the task list), no list of its own any more.
 *   POST /api/modes/quick/pins → { entries, supported } – the page calls it after toggling a star
 * On start the pins of the former extension (replaced:quick-tasks → storage.pinned) become favourites once, and every
 * 10 minutes the entries are compared with the tasks again (renamed or deleted in Hostwerk).
 * Choosing an entry opens the page with the action "t-<task id>", the page starts that task after asking.
 * Hostwerk before 3.0 has no setNewEntries – then only the fixed entry “Run a task …” stays.
 */
const Q = require('../lib/quick.js');

const favouritesOf = (ctx) => { const g = (ctx.settings && ctx.settings.get().general) || {}; return ((g.ui && g.ui.favorites && g.ui.favorites.task) || []).map(String); };

/** Pins of the former “Quick tasks” once into Hostwerk's favourites (in their order, behind existing ones). */
function takeOverPins(host) {
  const { ctx } = host;
  const mk = ctx.extMarket;
  if (!mk || typeof mk.storageAll !== 'function' || !ctx.settings) return null;
  const old = (mk.storageAll(host.id) || {})['replaced:quick-tasks'];
  const s = ctx.settings.get();
  if (!old || (s.oneClick && s.oneClick.pinsTaken)) return null;
  const pins = (old.storage && Array.isArray(old.storage.pinned) ? old.storage.pinned : []).map(String);
  s.general = s.general || {};
  s.general.ui = s.general.ui || {};
  const favs = { ...(s.general.ui.favorites || {}) };
  favs.task = [...new Set([...(favs.task || []).map(String), ...pins])];
  s.general.ui.favorites = favs;
  s.oneClick = { ...(s.oneClick || {}), pinsTaken: Date.now() };
  ctx.settings.save();
  return pins;
}

let timer = null;

function mount(host) {
  const { ctx } = host;
  try { takeOverPins(host); } catch (e) { if (host.log) host.log('take over pins:', e.message); }
  const supported = typeof host.setNewEntries === 'function';
  const sync = () => {
    if (!supported) return 0;
    try {
      const tasks = ctx.scheduler && typeof ctx.scheduler.list === 'function' ? ctx.scheduler.list() : [];
      return host.setNewEntries(Q.newEntries(tasks, favouritesOf(ctx)));
    } catch (e) { if (host.log) host.log('new menu:', e.message); return 0; }
  };
  host.router.post('/modes/quick/pins', (req, res) => res.json({ entries: sync(), supported }));
  sync();
  if (supported && !process.env.HW_TEST) { clearInterval(timer); timer = setInterval(sync, 10 * 60000); if (timer.unref) timer.unref(); }
  return { sync };
}

function unmount() { clearInterval(timer); timer = null; }

module.exports = { mount, unmount, takeOverPins, favouritesOf };

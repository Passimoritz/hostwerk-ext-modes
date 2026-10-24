'use strict';
/*
 * Modes (stored as settings.profiles – the name the core used since 2.x, kept so existing modes stay): named sets of
 * services for one job ("Work", "Minecraft night", "Client Miller"). Switching starts the services of the mode and,
 * if wanted, stops all others; while a mode is active, Hostwerk's autostart starts exactly its services.
 *
 * settings.profiles = { list: [{ id, name, color, accent, services: [service id …], hidden }], active: id | null }
 *   accent  the mode's colour becomes the accent colour of the whole interface while it is active (default on)
 *   hidden  own sidebar – these areas are hidden while the mode is active (null = as set by the user). The user's own
 *           choice is kept in ui.hiddenOwn and restored as soon as no such mode is active.
 * Service ids as in the process registry: web servers/databases = instance id, "mail", "ai", "mc:<id>", "app:<id>",
 * mail servers = their process id.
 */
const crypto = require('crypto');

const COLORS = ['#7c5cff', '#2563eb', '#16a34a', '#d97706', '#db2777', '#0891b2', '#dc2626', '#64748b'];

class Modes {
  constructor(host) {
    this.host = host;
    this.ctx = host.ctx;
    this.registry = host.core('proc').registry;
    this.broadcast = host.core('events').broadcast;
    const s = this.ctx.settings.get();
    if (!s.profiles || !Array.isArray(s.profiles.list)) s.profiles = { list: [], active: null };
  }
  get store() { return this.ctx.settings.get().profiles; }
  t(text, vars) { return this.host.t(text, vars); }

  /** All services a mode can contain → [{ id, name, kind, state }] */
  catalog() {
    const { web, dbm, minecraft, apps, mailserver, services, ai } = this.ctx;
    const st = (id) => { const p = this.registry.get(id); return p ? p.state : 'stopped'; };
    const out = [];
    for (const i of web.list()) out.push({ id: i.id, name: i.name, kind: 'web', state: st(i.id) });
    for (const i of dbm.list()) out.push({ id: i.id, name: i.name, kind: 'db', state: st(i.id) });
    out.push({ id: 'mail', name: this.t('Mail catcher'), kind: 'mail', state: services.mail.proc.state });
    if (mailserver) for (const i of mailserver.configured()) out.push({ id: i.proc.id, name: i.cfg.name, kind: 'mailserver', state: i.proc.state });
    if (apps) for (const a of apps.list()) out.push({ id: 'app:' + a.id, name: a.name, kind: 'app', state: st('app:' + a.id) });
    if (minecraft) for (const m of minecraft.list()) out.push({ id: 'mc:' + m.id, name: m.name, kind: 'mc', state: st('mc:' + m.id) });
    if (ai) out.push({ id: 'ai', name: this.t('AI helper (Ollama)'), kind: 'ai', state: ai.proc.state });
    return out;
  }
  status() { return { list: this.store.list, active: this.store.active, services: this.catalog() }; }
  get(id) {
    const p = this.store.list.find((x) => x.id === id);
    if (!p) throw Object.assign(new Error(this.t('Mode not found')), { status: 404 });
    return p;
  }
  /** Used by Hostwerk's autostart (ctx.profiles.activeProfile()) – start exactly these services. */
  activeProfile() { return this.store.active ? this.store.list.find((x) => x.id === this.store.active) || null : null; }

  save({ id, name, color, services, accent, hidden }) {
    const nm = String(name || '').trim().slice(0, 40);
    if (!nm) throw new Error(this.t('Please enter a name.'));
    const known = new Set(this.catalog().map((x) => x.id));
    const list = [...new Set((Array.isArray(services) ? services : []).filter((x) => typeof x === 'string' && known.has(x)))];
    if (this.store.list.some((x) => x.name.toLowerCase() === nm.toLowerCase() && x.id !== id)) throw new Error(this.t('There already is a mode “{name}”.', { name: nm }));
    let p = id ? this.get(id) : null;
    if (!p) { p = { id: crypto.randomBytes(4).toString('hex'), name: nm, color: COLORS[this.store.list.length % COLORS.length], services: [] }; this.store.list.push(p); }
    Object.assign(p, { name: nm, services: list, ...(/^#[0-9a-f]{6}$/i.test(color || '') ? { color } : {}), ...(typeof accent === 'boolean' ? { accent } : {}) });
    if (hidden === null) delete p.hidden;
    else if (Array.isArray(hidden)) p.hidden = [...new Set(hidden.filter((x) => typeof x === 'string' && /^[a-z-]{2,20}$/.test(x)))].slice(0, 30);
    if (this.store.active === p.id) this.applyNav(p);
    this.ctx.settings.save();
    this.broadcast({ type: 'settings' });
    return this.status();
  }
  /** Mode from the services running right now. */
  fromRunning(name) {
    const running = this.catalog().filter((x) => ['running', 'starting'].includes(x.state)).map((x) => x.id);
    if (!running.length) throw new Error(this.t('No service is running – start the services for the mode first.'));
    return this.save({ name, services: running });
  }
  remove(id) {
    this.get(id);
    this.store.list = this.store.list.filter((x) => x.id !== id);
    if (this.store.active === id) { this.store.active = null; this.applyNav(null); }
    this.ctx.settings.save();
    this.broadcast({ type: 'settings' });
    return this.status();
  }

  async startOne(id) {
    const { web, dbm, minecraft, apps, mailserver, services, ai } = this.ctx;
    if (id === 'mail') return services.mail.start();
    if (id === 'ai') return ai.start();
    if (id.startsWith('mc:')) return minecraft.start(id.slice(3));
    if (id.startsWith('app:')) return apps.start(id.slice(4));
    if (web.list().some((i) => i.id === id)) return web.start(id);
    if (dbm.list().some((i) => i.id === id)) return dbm.start(id);
    const ms = mailserver && mailserver.configured().find((i) => i.proc.id === id);
    if (ms) return ms.start();
    throw new Error(this.t('Service not found'));
  }
  async stopOne(id) {
    const p = this.registry.get(id);
    if (p && p.isRunning()) await (p.stopFn ? p.stopFn() : p.stop());
  }

  /**
   * Apply the mode's sidebar: with its own areas these apply (the user's own choice is remembered); otherwise – or
   * without a mode – the remembered own choice comes back.
   */
  applyNav(prof) {
    const g = this.ctx.settings.get().general;
    g.ui = { ...(g.ui || {}) };
    if (prof && Array.isArray(prof.hidden)) {
      if (!Array.isArray(g.ui.hiddenOwn)) g.ui.hiddenOwn = Array.isArray(g.ui.hidden) ? [...g.ui.hidden] : [];
      g.ui.hidden = [...prof.hidden];
    } else if (Array.isArray(g.ui.hiddenOwn)) {
      g.ui.hidden = g.ui.hiddenOwn;
      delete g.ui.hiddenOwn;
    }
  }

  /**
   * Activate a mode: first stop what does not belong (if wanted), then start – databases first, because websites and
   * apps usually need them. id = null → no mode (the single autostart switches apply again).
   */
  async activate(id, { stopOthers = true } = {}) {
    if (!id) { this.store.active = null; this.applyNav(null); this.ctx.settings.save(); this.broadcast({ type: 'settings' }); return { ...this.status(), started: [], stopped: [], errors: [] }; }
    const prof = this.get(id);
    this.store.active = id;
    this.applyNav(prof);
    this.ctx.settings.save();
    const cat = this.catalog();
    const name = (sid) => (cat.find((x) => x.id === sid) || {}).name || sid;
    const want = new Set(prof.services);
    const started = []; const stopped = []; const errors = [];
    if (stopOthers) {
      await Promise.all(cat.filter((x) => !want.has(x.id) && ['running', 'starting'].includes(x.state)).map(async (x) => {
        try { await this.stopOne(x.id); stopped.push(x.name); } catch (e) { errors.push(`${x.name}: ${e.message}`); }
      }));
    }
    const order = ['db', 'mail', 'mailserver', 'web', 'app', 'mc', 'ai'];
    for (const kind of order) {
      await Promise.all(cat.filter((x) => x.kind === kind && want.has(x.id) && x.state !== 'running').map(async (x) => {
        try { await this.startOne(x.id); started.push(x.name); } catch (e) { errors.push(`${name(x.id)}: ${e.message}`); }
      }));
    }
    this.broadcast({ type: 'settings' });
    return { ...this.status(), started, stopped, errors };
  }

  /** Extension removed: no mode stays active (colour, sidebar and autostart are Hostwerk's own again). The modes stay. */
  release() {
    if (!this.store.active) return;
    this.store.active = null;
    this.applyNav(null);
    this.ctx.settings.save();
    this.broadcast({ type: 'settings' });
  }

  routes(r) {
    r.get('/profiles', (req, res) => res.json(this.status()));
    r.post('/profiles', (req, res) => res.json((req.body || {}).fromRunning ? this.fromRunning((req.body || {}).name) : this.save(req.body || {})));
    r.put('/profiles/:id', (req, res) => res.json(this.save({ ...(req.body || {}), id: req.params.id })));
    r.delete('/profiles/:id', (req, res) => res.json(this.remove(req.params.id)));
    r.post('/profiles/activate', async (req, res) => res.json(await this.activate((req.body || {}).id || null, req.body || {})));
  }
}

module.exports = { Modes };

import { useEffect, useRef, useState } from 'react';
import { Layers, LayoutGrid, Plus, Trash2, Pencil, Check, Play, ChevronDown, ChevronUp, Settings2, Globe, Server, Mail, Boxes, Box, Bot, Square, MousePointerClick, Power, Sparkles } from 'lucide-react';
import { post, put, del, useApi } from '@hostwerk/api';
import { Btn, Modal, Field, Empty, Loading, toast, confirmDialog, promptDialog } from '@hostwerk/ui';
import { t } from '@hostwerk/i18n';
import './style.css';

/*
 * Modes: a set of services for one job – "Work" (web server, database, mail catcher), "Minecraft night" (just the
 * server). One click starts exactly these services and stops the others; while a mode is active, Hostwerk's autostart
 * follows it. Optional: own accent colour and sidebar.
 *   ModeSwitch   switch – on the overview (slot dashboard.actions, variant "hero") and at the bottom of the sidebar
 *                (slot sidebar.footer); shows before switching what starts and what stops
 *   ModesManager management – tab "Modes" on the Tasks page (slot tasks.tabs) and the extension's own page
 */
const MANAGE = '#/aufgaben/x-modes-modi';
const KIND = { web: ['Web servers', Globe], db: ['Databases', Server], mail: ['Mail', Mail], mailserver: ['Mail', Mail], app: ['Apps', Boxes], mc: ['Minecraft', Box], ai: ['AI', Bot] };
const GROUPS = ['web', 'db', 'mail', 'app', 'mc', 'ai'];
// Sidebar areas a mode may hide (same ids as Hostwerk's "Sidebar" settings)
const AREAS = [['projects', 'Projects'], ['apps', 'Apps'], ['mail', 'Email'], ['aufgaben', 'Tasks'], ['files', 'Files'], ['mc', 'Minecraft'], ['spiele', 'Game servers'], ['ki', 'AI'], ['claude', 'Claude'], ['live', 'Go live'], ['sicherungen', 'Backups']];
const groupOf = (k) => (k === 'mailserver' ? 'mail' : k);
const isOn = (s) => ['running', 'starting'].includes(s.state);

/** What switching to this mode does: { start: [services], stop: [services] } */
export function modeDiff(p, services) {
  const want = new Set(p ? p.services : []);
  return { start: services.filter((s) => want.has(s.id) && !isOn(s)), stop: p ? services.filter((s) => !want.has(s.id) && isOn(s)) : [] };
}
const diffText = (d) => [d.start.length ? t('starts {n}', { n: d.start.length }) : null, d.stop.length ? t('stops {n}', { n: d.stop.length }) : null].filter(Boolean).join(' · ') || t('nothing to do');

/** Activate a mode with a short feedback. */
async function activate(p, stopOthers = true) {
  try {
    const r = await post('/profiles/activate', { id: p ? p.id : null, stopOthers });
    if (!p) { toast.success(t('No mode active – the single autostart switches apply again.')); return r; }
    const parts = [r.started.length ? t('{n} started', { n: r.started.length }) : null, r.stopped.length ? t('{n} stopped', { n: r.stopped.length }) : null].filter(Boolean).join(', ');
    toast.success(parts ? t('Mode “{name}” active – {parts}', { name: p.name, parts }) : t('Mode “{name}” active', { name: p.name }));
    if (r.errors.length) toast.error(r.errors.join('\n'));
    return r;
  } catch (e) { toast.error(e.message); return null; }
}

async function fromRunning(reload) {
  const n = await promptDialog({ title: t('Mode from running services'), text: t('Everything running right now goes into the new mode.'), label: t('Name of the mode'), placeholder: t('e.g. Work'), confirm: t('Save') });
  if (!n) return;
  try { await post('/profiles', { fromRunning: true, name: n }); toast.success(t('Mode “{name}” saved', { name: n })); reload(); } catch (e) { toast.error(e.message); }
}

/* ------------------------------------------------------------------ Switch (overview + sidebar) */
function ModeSwitch({ variant = 'sidebar' }) {
  const d = useApi('/profiles');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const hero = variant === 'hero';
  useEffect(() => {
    if (!open) return undefined;
    d.reload(); // fresh service states – the "starts/stops" preview has to be right
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return null;
  const { list, active, services } = d.data;
  if (!hero && !list.length) return null; // sidebar: only once there are modes
  const cur = list.find((p) => p.id === active);
  const go = async (p) => { setOpen(false); setBusy(true); await activate(p); setBusy(false); d.reload(); };
  return (
    <div className={`profile-switch ${hero ? 'mode-hero' : ''}`} ref={ref}>
      {hero ? (
        <button type="button" className="btn mode-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={t('Switch mode – starts exactly the services you need for a job')}>
          <span className="profile-dot" style={{ background: cur ? cur.color : 'var(--muted)' }} />
          <span className="ellipsis">{busy ? t('Switching …') : cur ? cur.name : t('Mode')}</span>
          <ChevronDown size={13} />
        </button>
      ) : (
        <button type="button" className="profile-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={t('Switch mode')}>
          <span className="profile-dot" style={{ background: cur ? cur.color : 'var(--muted)' }} />
          <span className="grow ellipsis">{busy ? t('Switching …') : cur ? cur.name : t('No mode')}</span>
          <ChevronUp size={11} />
        </button>
      )}
      {open && (
        <div className={`profile-pop ${hero ? 'mode-pop' : ''}`} role="menu">
          {hero && <div className="mode-pop-head"><b>Switch mode</b><span className="tiny muted">One click starts the services of the mode and stops the others.</span></div>}
          {list.length === 0 && <div className="mode-pop-empty small"><span>No modes yet. For example “Work” with web server and database or “Minecraft night” with just the server.</span></div>}
          {list.map((p) => (
            <button key={p.id} type="button" role="menuitem" className={`profile-item ${p.id === active ? 'active' : ''}`} onClick={() => go(p)}>
              <span className="profile-dot" style={{ background: p.color }} />
              <span className="grow mode-item-txt"><span className="ellipsis">{p.name}</span>{hero && <span className="tiny muted ellipsis">{p.id === active ? t('active') : diffText(modeDiff(p, services))}</span>}</span>
              {!hero && <span className="tiny muted">{p.services.length}</span>}
              {p.id === active && <Check size={13} />}
            </button>
          ))}
          {cur && <button type="button" role="menuitem" className="profile-item" onClick={() => go(null)}><span className="profile-dot" style={{ background: 'var(--muted)' }} /><span className="grow">No mode</span>{hero && <span className="tiny muted">Services stay as they are</span>}</button>}
          <div className="mode-pop-sep" />
          <button type="button" role="menuitem" className="profile-item muted" onClick={() => { setOpen(false); fromRunning(d.reload); }}><Plus size={13} /><span className="grow">Save running services as a mode …</span></button>
          <a role="menuitem" className="profile-item muted" href={MANAGE} onClick={() => setOpen(false)}><Settings2 size={13} /><span className="grow">Manage modes …</span></a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Management (Tasks → Modes) */
function ModesManager() {
  const d = useApi('/profiles');
  const [edit, setEdit] = useState(null);
  if (!d.data) return <div className="card"><Loading /></div>;
  const { list, active, services } = d.data;
  const name = (id) => (services.find((s) => s.id === id) || {}).name || id;
  const stateOf = (id) => (services.find((s) => s.id === id) || {}).state;
  // Examples to click – prefilled with the services that exist on this PC
  const ids = (...kinds) => services.filter((s) => kinds.includes(groupOf(s.kind))).map((s) => s.id);
  const examples = [
    { name: t('Web development'), icon: Globe, text: t('Web servers, databases and mail catcher'), services: ids('web', 'db', 'mail') },
    services.some((s) => s.kind === 'mc') && { name: t('Minecraft night'), icon: Box, text: t('Only the Minecraft servers'), services: ids('mc') },
    services.some((s) => s.kind === 'app') && { name: t('Apps'), icon: Boxes, text: t('Your apps with databases'), services: ids('app', 'db') },
    { name: t('Break'), icon: Power, text: t('Everything off – saves power and memory'), services: [] },
  ].filter(Boolean).filter((x) => !list.some((p) => p.name.toLowerCase() === x.name.toLowerCase()));
  return (
    <div className="card">
      <div className="card-head"><Layers size={16} /><h3>Modes</h3>
        <div className="right row-tight"><Btn className="sm ghost" onClick={() => fromRunning(d.reload)}>From running services</Btn><Btn className="sm primary" icon={Plus} onClick={() => setEdit({ name: '', services: [] })}>New mode</Btn></div></div>
      <div className="card-body stack">
        {list.length === 0 && (
          <div className="modes-intro">
            <div className="modes-step"><span className="modes-step-ico"><Layers size={16} /></span><div><b>Put together</b><span className="small muted">Which services do you need for a job? For example web server and database for work.</span></div></div>
            <div className="modes-step"><span className="modes-step-ico"><MousePointerClick size={16} /></span><div><b>Switch with one click</b><span className="small muted">On the overview or at the bottom of the sidebar – Hostwerk starts the services of the mode and stops the others.</span></div></div>
            <div className="modes-step"><span className="modes-step-ico"><Play size={16} /></span><div><b>Also at start</b><span className="small muted">When Hostwerk starts, exactly the services of the active mode run. Optionally with its own colour and sidebar.</span></div></div>
          </div>
        )}
        {list.length > 0 && (
          <div className="modes-grid">
            {list.map((p) => (
              <div key={p.id} className={`mode-card ${p.id === active ? 'active' : ''}`} style={{ '--mode': p.color }}>
                <div className="mode-card-head">
                  <span className="profile-dot lg" style={{ background: p.color }} />
                  <b className="grow ellipsis">{p.name}</b>
                  {p.id === active && <span className="badge ok">{t('active')}</span>}
                  <button type="button" className="btn ghost xs icon" title={t('Edit')} aria-label={t('Edit {name}', { name: p.name })} onClick={() => setEdit(p)}><Pencil /></button>
                  <button type="button" className="btn ghost xs icon" title={t('Delete')} aria-label={t('Delete {name}', { name: p.name })} onClick={async () => { if (await confirmDialog({ title: t('Delete mode “{name}”?', { name: p.name }), text: t('The services themselves stay.'), confirm: t('Delete'), danger: true })) { await del(`/profiles/${p.id}`); d.reload(); } }}><Trash2 /></button>
                </div>
                <div className="mode-chips">
                  {p.services.length ? p.services.map((id) => <span key={id} className={`mode-chip ${isOn({ state: stateOf(id) }) ? 'on' : ''}`}><span className="d" />{name(id)}</span>)
                    : <span className="small muted">{t('no services – everything off')}</span>}
                </div>
                <div className="mode-card-foot">
                  <span className="tiny muted">{p.id === active ? t('Running right now') : diffText(modeDiff(p, services))}</span>
                  {p.id !== active
                    ? <Btn className="xs primary" icon={Play} onClick={async () => { await activate(p); d.reload(); }}>Switch</Btn>
                    : <Btn className="xs ghost" icon={Square} onClick={async () => { await activate(null); d.reload(); }}>End mode</Btn>}
                </div>
              </div>
            ))}
          </div>
        )}
        {examples.length > 0 && services.length > 0 && (
          <div>
            <div className="tiny muted bold modes-ex-title"><Sparkles size={12} />{list.length ? t('More ideas') : t('To start – one click creates the mode, you can adjust it afterwards')}</div>
            <div className="modes-examples">
              {examples.map((x) => (
                <button key={x.name} type="button" className="mode-example" onClick={() => setEdit({ name: x.name, services: x.services })}>
                  <x.icon size={16} /><span className="grow"><b>{x.name}</b><span className="tiny muted">{x.text}</span></span><Plus size={14} className="muted" />
                </button>
              ))}
            </div>
          </div>
        )}
        {list.length === 0 && services.length === 0 && <Empty icon={Layers} title="No services yet" text="First set up web servers, databases or Minecraft servers – then you can put them together into modes." />}
      </div>
      {edit && <ModeEditor p={edit} services={services} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); d.reload(); }} />}
    </div>
  );
}

function ModeEditor({ p, services, onClose, onSaved }) {
  const [f, setF] = useState({ name: p.name, services: [...p.services], color: p.color || '#8b5cf6', accent: p.accent !== false, hidden: Array.isArray(p.hidden) ? [...p.hidden] : null });
  // Own sidebar: checked = visible; the hidden areas are what is stored
  const toggleArea = (id) => setF({ ...f, hidden: f.hidden.includes(id) ? f.hidden.filter((x) => x !== id) : [...f.hidden, id] });
  const toggle = (id) => setF({ ...f, services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] });
  const save = async () => {
    try { if (p.id) await put(`/profiles/${p.id}`, f); else await post('/profiles', f); toast.success(t('Mode saved')); onSaved(); } catch (e) { toast.error(e.message); }
  };
  return (
    <Modal title={p.id ? t('Mode “{name}”', { name: p.name }) : t('New mode')} subtitle={t('These services run in the mode – all others are stopped when switching.')} onClose={onClose}
      footer={<><span className="grow small muted">{t('When switching:')} {diffText(modeDiff({ services: f.services }, services))}</span><Btn onClick={onClose}>Cancel</Btn><Btn className="primary" disabled={!f.name.trim()} onClick={save}>Save</Btn></>}>
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Name"><input className="input" autoFocus placeholder={t('e.g. Work, Minecraft night, Client Miller')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {GROUPS.map((g) => {
          const list = services.filter((s) => groupOf(s.kind) === g);
          if (!list.length) return null;
          const [label, I] = KIND[g];
          return (
            <div key={g}>
              <div className="tiny muted bold row-tight modes-group"><I size={12} /> <span>{t(label)}</span></div>
              <div className="profile-pick">
                {list.map((s) => (
                  <label key={s.id} className={`check profile-chip ${f.services.includes(s.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={f.services.includes(s.id)} onChange={() => toggle(s.id)} />{s.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {services.length === 0 && <div className="small muted">No services set up yet – an empty mode stops everything when switching.</div>}
        <div className="row modes-color">
          <label className="row-tight small"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} aria-label={t('Colour of the mode')} className="modes-color-input" />Colour</label>
          <label className="check small"><input type="checkbox" checked={f.accent} onChange={(e) => setF({ ...f, accent: e.target.checked })} />As the accent colour of the interface while the mode is active</label>
        </div>
        <div>
          <label className="check small"><input type="checkbox" checked={!!f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked ? [] : null })} />Own sidebar for this mode</label>
          {f.hidden && (
            <div className="profile-pick modes-areas" role="group" aria-label={t('Visible areas')}>
              {AREAS.map(([id, label]) => (
                <label key={id} className={`check profile-chip ${!f.hidden.includes(id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={!f.hidden.includes(id)} onChange={() => toggleArea(id)} />{t(label)}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Own page (Extensions → Open) – the same management as the tab on the Tasks page. */
function ModesPage() {
  return (
    <div className="page fade-in">
      <div className="page-head"><div><h1><LayoutGrid size={22} /> Modes</h1><p>Services for one job with one click.</p></div></div>
      <ModesManager />
    </div>
  );
}

function HeroSwitch() { return <ModeSwitch variant="hero" />; }

export default {
  pages: { main: ModesPage },
  slots: {
    'tasks.tabs': [{ id: 'modi', title: 'Modes', icon: Layers, Component: ModesManager, order: 20 }],
    'dashboard.actions': [{ id: 'switch', Component: HeroSwitch }],
    'sidebar.footer': [{ id: 'switch', Component: ModeSwitch }],
  },
};

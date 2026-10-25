import { useEffect, useRef, useState } from 'react';
import { Zap, Play, ListTodo } from 'lucide-react';
import { post, useApi } from '@hostwerk/api';
import { Btn, Empty, Loading, TileEmpty, toast, confirmDialog } from '@hostwerk/ui';
import { FavButton, useFavSort } from '@hostwerk/kit';
import { t } from '@hostwerk/i18n';
import Q from '../../lib/quick.js';

/*
 * One click, part “Tasks” (until 1.5 the extension “Quick tasks”): your scheduled tasks as big buttons – one click runs a
 * backup, a report or a script after asking. Favourites are Hostwerk's own (the same star as in the task list) and come
 * first; the server part puts them into the “New” menu. Texts English, German from locales/de.json.
 */
const BADGE = { running: 'warn', error: 'err', ok: 'ok', new: '' };
const STATE = { running: 'running', error: 'last run failed', ok: 'last run ok', new: 'never run' };
const syncNewMenu = () => post('/modes/quick/pins').catch(() => {});

/** One run: ask first (like Hostwerk does for sandboxed pages), then wait for the result. */
async function runTask(x) {
  if (!(await confirmDialog({ title: t('Run “{name}”?', { name: x.name }), text: x.actionLabel || '', confirm: t('Run') }))) return null;
  try {
    const r = Q.result(await post(`/tasks/${encodeURIComponent(x.id)}/run`));
    if (r) toast[r.status === 'error' ? 'error' : 'success'](t(r.status === 'error' ? '“{name}” failed' : '“{name}” is done', { name: x.name }));
    return r;
  } catch (e) {
    if (Q.stillRunning(e)) toast(t('“{name}” is still running – the result appears here when it is done.', { name: x.name }));
    else if (!Q.declined(e)) toast.error(e);
    return null;
  }
}

/** Tasks as big buttons – search, favourites first, result of the last run in the card. */
export function QuickTasks({ action = null }) {
  const st = useApi('/tasks', [], { live: false, poll: true });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(() => new Set());
  const [results, setResults] = useState(() => new Map());
  const search = useRef(null);
  const all = (st.data && Array.isArray(st.data.list) ? st.data.list : []);
  // Last run first, then by name – favourites (Hostwerk's star) move to the top
  const list = useFavSort('task', Q.pick(all, [], Infinity, query));
  const run = async (x) => {
    if (busy.has(x.id)) return;
    setBusy((b) => new Set(b).add(x.id));
    const r = await runTask(x);
    if (r) setResults((m) => new Map(m).set(x.id, r));
    setBusy((b) => { const n = new Set(b); n.delete(x.id); return n; });
    st.reload({ silent: true });
  };
  // “Run a task …” (quick search, New menu, shortcut) focuses the search; a favourite from the New menu runs right away
  const done = useRef('');
  useEffect(() => {
    if (!action || !st.data || done.current === `${action.id}@${action.at}`) return;
    done.current = `${action.id}@${action.at}`;
    const task = Q.taskOfAction(action);
    if (task) { const x = all.find((y) => String(y.id) === task); if (x) run(x); else toast.error(t('This task no longer exists – it was deleted in Hostwerk.')); return; }
    if (action.id === 'run' && search.current) { search.current.focus(); search.current.select(); }
  }, [action, st.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st.data) return st.error ? <Empty icon={ListTodo} title="The tasks could not be loaded" text={String(st.error)} action={<Btn className="sm" onClick={() => st.reload()}>Try again</Btn>} /> : <div className="card"><Loading /></div>;
  return (
    <div className="card">
      <div className="card-head"><Zap size={16} /><h3>Tasks</h3><span className="small muted">{query ? t('{n} of {all}', { n: list.length, all: all.length }) : t('{n} tasks', { n: all.length })}</span></div>
      <div className="card-body stack">
        <p className="small muted oc-sub">Run your tasks with one click – Hostwerk asks first. The star moves a task to the top and into the “New” menu.</p>
        {all.length > 0 && (
          <input ref={search} className="input oc-search" type="search" value={query} placeholder={t('Search a task – Enter runs the first')} aria-label={t('Search a task')} autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) run(list[0]); else if (e.key === 'Escape' && query) setQuery(''); }} />
        )}
        {!all.length ? (
          <Empty icon={ListTodo} title="No tasks yet" text="Add one in Hostwerk under “Tasks” – for example a backup or a report." action={<a className="btn sm" href="#/aufgaben">Open tasks</a>} />
        ) : !list.length ? (
          <Empty icon={ListTodo} title="No task matches" text="Try another word – the search looks at name, action and target." />
        ) : (
          <div className="oc-tasks">
            {list.map((x) => {
              const s = busy.has(x.id) ? 'running' : Q.state(x);
              const r = results.get(x.id);
              return (
                <div key={x.id} className="card card-pad oc-task" data-state={s} onClick={(e) => { if (e.target.closest('.fav-btn')) syncNewMenu(); }}>
                  <div className="row"><b className="grow ellipsis" title={x.name}>{x.name}</b><FavButton kind="task" id={x.id} /></div>
                  <div className="tiny muted ellipsis">{x.actionLabel || ''}</div>
                  <div className="row"><span className={`badge ${BADGE[s]}`}>{t(STATE[s])}</span><span className="grow" />
                    <Btn className="primary" icon={Play} busy={s === 'running'} disabled={s === 'running'} aria-label={t('Run “{name}”', { name: x.name })} onClick={() => run(x)}>Run</Btn></div>
                  {r && <div className="small oc-result" role="status"><span className={r.status === 'error' ? 'c-err' : 'c-ok'}>{t(r.status === 'error' ? 'Failed after {s} s' : 'Done after {s} s', { s: Math.round(r.ms / 100) / 10 })}</span>{r.line && <span className="muted mono ellipsis"> {r.line}</span>}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Dashboard tile: the first four tasks (favourites first) as buttons. */
export function QuickTile() {
  const st = useApi('/tasks', [], { live: false, poll: true });
  const [busy, setBusy] = useState('');
  const all = (st.data && Array.isArray(st.data.list) ? st.data.list : []);
  const list = useFavSort('task', Q.pick(all, [], Infinity, '')).slice(0, 4);
  if (!st.data) return st.error ? <TileEmpty icon={ListTodo} text="The tasks could not be loaded" /> : <div className="card-body"><Loading /></div>;
  if (!list.length) return <TileEmpty icon={ListTodo} text="No tasks yet." href="#/aufgaben" />;
  return (
    <div className="card-body oc-tile">
      {list.map((x) => {
        const s = busy === x.id ? 'running' : Q.state(x);
        return <Btn key={x.id} className="sm oc-tile-btn" icon={Play} busy={s === 'running'} data-state={s} title={`${x.name} – ${t(STATE[s])}`} onClick={async () => { setBusy(x.id); await runTask(x); setBusy(''); st.reload({ silent: true }); }}><span className="ellipsis">{x.name}</span></Btn>;
      })}
    </div>
  );
}

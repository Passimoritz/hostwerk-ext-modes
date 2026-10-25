/* One click, part “Tasks” (until 1.5 the extension “Quick tasks”) – pure logic without DOM, tested in tests/quick-lib.test.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QuickTasks = api;
}(typeof self !== 'undefined' ? self : this, () => {
  /** Passt eine Aufgabe zur Suche? Name, Aktion und Ziel, ohne Groß-/Kleinschreibung, alle Wörter müssen vorkommen. */
  function matches(t, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = `${t.name || ''} ${t.actionLabel || ''} ${(t.action && t.action.target) || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }
  /**
   * Welche Aufgaben als Knöpfe? Angeheftete zuerst (Reihenfolge wie angeheftet), dann die zuletzt gelaufenen.
   * max begrenzt (Kachel: 4), Seite ohne Grenze; query filtert (Suche).
   */
  function pick(list, pinned = [], max = Infinity, query = '') {
    const all = (list || []).filter((t) => t && t.id && matches(t, query));
    const pins = pinned.map((id) => all.find((t) => t.id === id)).filter(Boolean);
    const rest = all.filter((t) => !pinned.includes(t.id)).sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0) || String(a.name).localeCompare(String(b.name)));
    return [...pins, ...rest].slice(0, max).map((t) => ({ ...t, pinned: pinned.includes(t.id) }));
  }
  /** Zustand in einem Wort: läuft, Fehler, ok, neu. */
  function state(t) { if (t.running || t.retrying) return 'running'; if (!t.lastRun) return 'new'; return t.lastStatus === 'error' ? 'error' : 'ok'; }
  /** Anheften/Lösen (für den Speicher der Erweiterung). */
  function togglePin(pinned, id) { return pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]; }
  /**
   * Angeheftete, die es nicht mehr gibt (in Hostwerk gelöscht), aus dem Speicher nehmen.
   * → { pinned, changed } – changed sagt, ob gespeichert werden muss.
   */
  function prune(pinned, list) {
    const ids = new Set((list || []).map((t) => t && t.id));
    const kept = (pinned || []).filter((id) => ids.has(id));
    return { pinned: kept, changed: kept.length !== (pinned || []).length };
  }
  /** Letzte sinnvolle Zeile der Ausgabe eines Laufs (für die Ergebniszeile), höchstens 160 Zeichen. */
  function lastLine(output) {
    const lines = String(output || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const l = lines.length ? lines[lines.length - 1] : '';
    return l.length > 160 ? `${l.slice(0, 157)}…` : l;
  }
  /** Ergebnis eines Laufs ({ status, ms, output } aus Hostwerk) in eine Form für die Anzeige. */
  function result(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return { status: entry.status === 'error' ? 'error' : 'ok', ms: Number(entry.ms) || 0, line: lastLine(entry.output), at: entry.at || Date.now() };
  }
  /** Hat Hostwerk den Lauf abgelehnt (Rückfrage mit „Nein“ beantwortet)? Dann keine Fehlermeldung. */
  function declined(err) { return /declined|abgelehnt/i.test(String((err && err.message) || err || '')); }
  /** Brücke hat nicht rechtzeitig geantwortet – die Aufgabe läuft aber womöglich weiter. */
  function stillRunning(err) { return /did not answer|nicht geantwortet/i.test(String((err && err.message) || err || '')); }
  /**
   * Angeheftete Aufgaben als Einträge im Menü „Neu“ (SDK 2.10, zur Laufzeit): je Aufgabe „Aufgabe „X“ starten“, in der
   * Reihenfolge der Pins, höchstens 6 (mehr nimmt Hostwerk nicht). Die Seite bekommt sie als Aktion „t-<Aufgaben-ID>“.
   */
  const ENTRY = 't-';
  function newEntries(list, pinned = []) {
    const byId = new Map((list || []).filter((t) => t && t.id).map((t) => [String(t.id), t]));
    return (pinned || []).map((id) => byId.get(String(id))).filter((t) => t && /^[a-z0-9-]{1,28}$/.test(String(t.id))).slice(0, 6).map((t) => {
      const name = String(t.name || t.id).replace(/\s+/g, ' ').trim().slice(0, 60);
      return { id: `${ENTRY}${t.id}`, title: { de: `Aufgabe „${name}“ starten`, en: `Run task “${name}”` }, description: { de: 'Angeheftete Schnell-Aufgabe', en: 'Pinned quick task' }, icon: 'zap' };
    });
  }
  /** Aktion aus dem Menü „Neu“ → Aufgaben-ID (oder null, wenn es keine angeheftete Aufgabe ist). */
  function taskOfAction(a) { const id = a && typeof a.id === 'string' && a.id.startsWith(ENTRY) ? a.id.slice(ENTRY.length) : ''; return id || null; }
  return { matches, pick, state, togglePin, prune, lastLine, result, declined, stillRunning, newEntries, taskOfAction };
}));

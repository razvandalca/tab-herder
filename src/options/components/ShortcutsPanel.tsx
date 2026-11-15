import { useEffect, useState } from 'preact/hooks';

export function ShortcutsPanel() {
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);
  useEffect(() => {
    void chrome.commands.getAll().then(setCommands);
  }, []);
  return (
    <section>
      <div class="card">
        <h2>Keyboard shortcuts</h2>
        <table class="table">
          <thead><tr><th>Action</th><th>Shortcut</th></tr></thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.name}>
                <td>{c.description || c.name}</td>
                <td>{c.shortcut ? <span class="kbd">{c.shortcut}</span> : <span class="muted">not set</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="hint">
          Change them at <a href="#" onClick={(e) => { e.preventDefault(); void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); }}>chrome://extensions/shortcuts</a>.
        </div>
      </div>
      <div class="card">
        <h2>Right-click menu</h2>
        <div class="hint">Right-click any page or the toolbar icon and open the “Tab Herder” submenu for group actions, duplicates and cleanup.</div>
      </div>
    </section>
  );
}

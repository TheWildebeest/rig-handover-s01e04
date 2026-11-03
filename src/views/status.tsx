import type { Status } from '../status.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((night) => {
            const counts = status.digestCounts[night] ?? { ok: null, retry: null, fail: null };
            const ok = counts.ok ?? '—';
            const retry = counts.retry ?? '—';
            const fail = counts.fail ?? '—';
            return (
              <li>
                <a href={`/digest/${night}`}>{night}</a>
                {' '}({ok} ok / {retry} retry / {fail} fail)
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

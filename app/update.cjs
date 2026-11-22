// "New version out" check: compare the latest GitHub release tag to this build. No auto-install.
// ponytail: notify only; switch to electron-updater if manual reinstalls become a chore.
const RELEASES = 'https://github.com/pj002321/agent_office_env/releases/latest';
const API = 'https://api.github.com/repos/pj002321/agent_office_env/releases/latest';

// 'v0.2.0' vs '0.1.2' → true when a is strictly newer
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// resolves { version, url } when a newer release exists, else null; offline/rate-limited → null
const check = current => fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
  .then(r => r.ok ? r.json() : null)
  .then(r => r?.tag_name && newer(r.tag_name, current) ? { version: r.tag_name.replace(/^v/, ''), url: RELEASES } : null)
  .catch(() => null);

module.exports = { newer, check };

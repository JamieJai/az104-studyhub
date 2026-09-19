// End-to-end pre-flight against a base URL: middleware, redirects, signup/login/progress/report/admin, p119 content.
const B = process.argv[2] || 'http://127.0.0.1:8788';
const ADMIN_PASS = process.argv[3] || 'localadmin';
const DO_SIGNUP = process.argv[4] !== 'nosignup';
let cookie = '';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const req = async (p, opt = {}) => {
  const headers = { ...(opt.headers || {}) }; if (cookie) headers.Cookie = cookie;
  const r = await fetch(B + p, { redirect: 'manual', ...opt, headers });
  const sc = r.headers.get('set-cookie'); if (sc) { const m = sc.match(/az104_auth=([^;]*)/); if (m) cookie = m[1] ? `az104_auth=${m[1]}` : ''; }
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { }
  return { status: r.status, loc: r.headers.get('location') || '', text, json, h: r.headers };
};
(async () => {
  let r = await req('/AZ-104_CBT/', { headers: { Accept: 'text/html' } });
  check('middleware: /AZ-104_CBT/ unauth → 302 /?next=', r.status === 302 && r.loc.includes('?next='), `${r.status} ${r.loc}`);
  r = await req('/', { headers: { Accept: 'text/html' } });
  check('root login page 200', r.status === 200 && r.text.includes('로그인'), String(r.status));
  r = await req('/cbt', { headers: { Accept: 'text/html' } });
  check('_redirects: /cbt → /AZ-104_CBT/', r.status === 302 && r.loc.endsWith('/AZ-104_CBT/'), `${r.status} ${r.loc}`);
  r = await req('/lab', { headers: { Accept: 'text/html' } });
  check('_redirects: /lab → /AZ-104_Lab_Portal/', r.status === 302 && r.loc.endsWith('/AZ-104_Lab_Portal/'), `${r.status} ${r.loc}`);
  r = await req('/AZ-104_Lab_Portal/', { headers: { Accept: 'text/html' } });
  check('lab portal open without login', r.status === 200, String(r.status));
  r = await req('/admin/', { headers: { Accept: 'text/html' } });
  check('admin page 200', r.status === 200 && r.text.includes('관리자'), String(r.status));
  r = await req('/api/auth/me');
  check('/api/auth/me unauth 401 json', r.status === 401 && r.json && r.json.error === 'unauthorized', r.text.slice(0, 60));
  r = await req('/api/progress');
  check('/api/progress unauth 401 json', r.status === 401 && r.json && r.json.error === 'unauthorized', r.text.slice(0, 60));
  r = await req('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'a', password: 'xxxx' }) });
  check('signup invalid_name 400', r.status === 400 && r.json && r.json.error === 'invalid_name', r.text.slice(0, 60));
  r = await req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'nobody_zz', password: 'xxxx' }) });
  check('login bad_credentials 401', r.status === 401 && r.json && r.json.error === 'bad_credentials', r.text.slice(0, 60));
  r = await req('/service-worker.js');
  check('sw has -p119 version', r.status === 200 && r.text.includes("v127-q344-p119"), (r.text.match(/VERSION = '([^']+)'/) || [])[1]);
  check('sw cache-control no-store (_headers)', (r.h.get('cache-control') || '').includes('no-store'), r.h.get('cache-control') || '');
  r = await req('/AZ-104_CBT/choices.js');
  const ch = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1));
  check('p119 src229 applied', ch['229'].boxes[1].options[1] === '"Microsoft.Storage/storageAccounts/read"' && ch['229'].boxes[1].answer === 1);
  check('p119 src520 applied', ch['520'].boxes[1].options.length === 3 && ch['520'].boxes[1].answer === 2);
  check('p119 src285 applied', ch['285'].boxes[1].options.length === 4 && ch['285'].boxes[1].answer === 1);
  r = await req('/AZ-104_CBT/assets/questions/q001_1.png');
  check('image 200 png', r.status === 200 && (r.h.get('content-type') || '').includes('image/png'), `${r.status} ${r.h.get('content-type')}`);
  check('image has nosniff (_headers)', r.h.get('x-content-type-options') === 'nosniff');

  if (DO_SIGNUP) {
    const name = 'preflight_' + Date.now().toString(36);
    r = await req('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'test1234' }) });
    check('signup ok + cookie', r.status === 200 && r.json && r.json.ok && !!cookie, r.text.slice(0, 80));
    r = await req('/api/auth/me');
    check('me after signup', r.status === 200 && r.json && r.json.user && r.json.user.name === name, r.text.slice(0, 80));
    r = await req('/AZ-104_CBT/', { headers: { Accept: 'text/html' } });
    check('CBT page 200 when logged in', r.status === 200, String(r.status));
    r = await req('/', { headers: { Accept: 'text/html' } });
    check('root → CBT redirect when logged in', r.status === 302 && r.loc.endsWith('/AZ-104_CBT/'), `${r.status} ${r.loc}`);
    r = await req('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: { '229': { result: 'ok', updatedAt: new Date().toISOString() } }, session: { cursor: 1 } }) });
    check('progress POST', r.status === 200 && r.json && r.json.ok, r.text.slice(0, 80));
    r = await req('/api/progress');
    check('progress GET roundtrip', r.status === 200 && r.json && r.json.progress && r.json.progress['229'] && r.json.progress['229'].result === 'ok', r.text.slice(0, 80));
    r = await req('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 229, kind: 'other', note: 'preflight' }) });
    check('report POST', r.status === 200 && r.json && r.json.ok, r.text.slice(0, 80));
    r = await req('/api/progress', { method: 'DELETE' }); r = await req('/api/report', { method: 'DELETE' });
    r = await req('/api/auth/logout', { method: 'POST' });
    check('logout clears cookie', r.status === 200 && !cookie);
    // admin: login, overview, delete the preflight user
    let adminCookie = '';
    let a = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'admin', password: ADMIN_PASS }) });
    const sc = a.headers.get('set-cookie') || ''; adminCookie = (sc.match(/az104_admin=[^;]*/) || [])[0] || '';
    check('admin login', a.status === 200 && !!adminCookie, String(a.status));
    a = await fetch(B + '/api/admin/overview', { headers: { Cookie: adminCookie } }); const ov = await a.json();
    check('admin overview (maxUsers present)', a.status === 200 && Array.isArray(ov.users) && 'maxUsers' in ov, `users=${ov.totals && ov.totals.users} maxUsers=${ov.maxUsers}`);
    const me = (ov.users || []).find(u => u.name === name);
    a = await fetch(B + `/api/admin/user?id=${me && me.id}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    check('admin delete preflight user', a.status === 200, String(a.status));
    a = await fetch(B + '/api/admin/overview', { headers: { Cookie: adminCookie } }); const ov2 = await a.json();
    check('preflight user gone', !(ov2.users || []).some(u => u.name === name), `users now=${ov2.totals && ov2.totals.users}`);
  }
  const fails = results.filter(x => !x.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed${fails ? ` — ${fails} FAILED` : ''}`);
  process.exit(fails ? 1 : 0);
})();

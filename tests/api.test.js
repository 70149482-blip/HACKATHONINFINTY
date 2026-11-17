// Run with: npm test
// Uses a temporary database and a MOCKED AI response (no API key or internet needed).
// Tests the real pipeline: AI output -> validation -> transaction -> role-based access.
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nw-')), 'test.db');
process.env.SESSION_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'test-key';

const app = require('../src/server');
const db = require('../src/db');

const realFetch = global.fetch;
let aiReply = null; // what the mocked AI returns
let aiCalls = [];
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.anthropic.com')) {
    aiCalls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: typeof aiReply === 'string' ? aiReply : JSON.stringify(aiReply) }] }) };
  }
  return realFetch(url, opts);
};

const T = (title, owner, hours, date, desc = 'scope') => ({ title, description: desc, assigneeId: owner, estimatedHours: hours, deadline: date });
function goodDraft() {
  return { projects: [
    { name: 'UrbanCart Website', clientName: 'UrbanCart Clothing', description: 'Demo cart only', managerId: 'PM01', deadline: '2026-10-20', tasks: [
      T('Product catalog UI', 'DEV01', 12, '2026-10-12'), T('Demo cart UI', 'DEV01', 8, '2026-10-15'),
      T('Product and cart APIs', 'DEV02', 14, '2026-10-14'), T('Website integration and testing', 'DEV01', 6, '2026-10-19')] },
    { name: 'QuickServe Mobile App', clientName: 'QuickServe Services', description: 'Flutter demo', managerId: 'PM02', deadline: '2026-10-24', tasks: [
      T('Login and profile screens', 'DEV03', 8, '2026-10-12'), T('Service booking screens', 'DEV03', 12, '2026-10-17'),
      T('Booking and account APIs', 'DEV02', 16, '2026-10-16'), T('Mobile integration and testing', 'DEV04', 10, '2026-10-22')] },
    { name: 'HelpDeskPro AI Assistant', clientName: 'HelpDeskPro Solutions', description: 'FAQ assistant', managerId: 'PM03', deadline: '2026-10-22', tasks: [
      T('FAQ document processing', 'DEV06', 10, '2026-10-13'), T('Assistant answer generation', 'DEV05', 14, '2026-10-17'),
      T('Human escalation flow', 'DEV05', 6, '2026-10-18'), T('Assistant evaluation and testing', 'DEV06', 8, '2026-10-21')] },
  ] };
}

let server, base;
test.before(async () => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

async function login(email, password = 'Demo123!') {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { status: res.status, cookie };
}
async function call(cookie, method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const counts = () => ({ p: db.prepare('SELECT COUNT(*) c FROM projects').get().c, t: db.prepare('SELECT COUNT(*) c FROM tasks').get().c });

test('seeding is idempotent and creates ten users', () => {
  const { seedDemoUsers } = require('../src/seed');
  seedDemoUsers(); seedDemoUsers();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 10);
});

test('login rejects bad credentials; unauthenticated data is blocked', async () => {
  assert.equal((await login('admin@novaworks.example', 'wrong')).status, 401);
  assert.equal((await login('nobody@novaworks.example')).status, 401);
  assert.equal((await call('', 'GET', '/api/projects')).status, 401);
});

test('only admin can create from transcript; empty transcript rejected', async () => {
  const mgr = await login('ayesha@novaworks.example');
  assert.equal((await call(mgr.cookie, 'POST', '/api/transcripts/create', { transcript: 'x' })).status, 403);
  assert.equal((await call(mgr.cookie, 'POST', '/api/transcripts/commit', { draft: goodDraft() })).status, 403);
  const admin = await login('admin@novaworks.example');
  assert.equal((await call(admin.cookie, 'POST', '/api/transcripts/create', { transcript: '   ' })).status, 400);
});

test('AI flow: transcript -> 3 projects, 12 tasks, directory sent without secrets', async () => {
  const admin = await login('admin@novaworks.example');
  aiReply = '```json\n' + JSON.stringify(goodDraft()) + '\n```'; // also tests fence stripping
  aiCalls = [];
  const r = await call(admin.cookie, 'POST', '/api/transcripts/create', { transcript: 'the meeting' });
  assert.equal(r.status, 201);
  assert.equal(r.data.created.length, 3);
  assert.equal(r.data.totalTasks, 12);
  const sent = JSON.stringify(aiCalls[0]);
  assert.ok(!sent.includes('Demo123') && !sent.includes('password') && !sent.includes('@novaworks.example'));
  assert.ok(sent.includes('DEV01') && sent.includes('the meeting'));
  const list = (await call(admin.cookie, 'GET', '/api/projects')).data.projects;
  const hours = Object.fromEntries(list.map((p) => [p.name, p.totalHours]));
  assert.deepEqual(hours, { 'UrbanCart Website': 40, 'QuickServe Mobile App': 46, 'HelpDeskPro AI Assistant': 38 });
});

test('role-based access on direct requests', async () => {
  const admin = await login('admin@novaworks.example');
  const all = (await call(admin.cookie, 'GET', '/api/projects')).data.projects;
  const urban = all.find((p) => p.name.startsWith('UrbanCart')), quick = all.find((p) => p.name.startsWith('QuickServe'));

  const ayesha = await login('ayesha@novaworks.example');
  const aList = (await call(ayesha.cookie, 'GET', '/api/projects')).data.projects;
  assert.deepEqual(aList.map((p) => p.name), ['UrbanCart Website']);
  assert.equal((await call(ayesha.cookie, 'GET', `/api/projects/${quick.id}`)).status, 404);
  assert.equal((await call(ayesha.cookie, 'GET', `/api/projects/${urban.id}`)).data.project.tasks.length, 4);

  const ali = await login('ali@novaworks.example');
  const aliTasks = (await call(ali.cookie, 'GET', '/api/my-tasks')).data.tasks;
  assert.equal(aliTasks.length, 3);
  assert.equal((await call(ali.cookie, 'GET', `/api/projects/${quick.id}`)).status, 404);
  const aliProject = (await call(ali.cookie, 'GET', `/api/projects/${urban.id}`)).data.project;
  assert.equal(aliProject.tasks.length, 3); // never Hamza's API task
  assert.ok(aliProject.tasks.every((t) => t.assigneeName === 'Ali Raza'));

  const hamza = await login('hamza@novaworks.example');
  const hTasks = (await call(hamza.cookie, 'GET', '/api/my-tasks')).data.tasks;
  assert.equal(hTasks.length, 2);
  assert.deepEqual(new Set(hTasks.map((t) => t.projectName)), new Set(['UrbanCart Website', 'QuickServe Mobile App']));

  assert.equal((await call(ali.cookie, 'POST', '/api/admin/reset')).status, 403);
  assert.equal((await call(ayesha.cookie, 'GET', '/api/my-tasks')).status, 403);
  assert.equal((await call(ali.cookie, 'GET', '/api/team')).data.team.length, 10);
});

test('invalid AI output saves nothing and returns fixable issues', async () => {
  const admin = await login('admin@novaworks.example');
  const before = counts();
  const bad = goodDraft();
  bad.projects[0].tasks[0].assigneeId = 'KAMRAN';           // not an employee
  bad.projects[1].tasks[0].deadline = '2026-11-30';          // after project deadline
  bad.projects[2].managerId = 'DEV05';                       // agent, not manager
  bad.projects[2].tasks[0].estimatedHours = 0;               // not positive
  aiReply = bad;
  const r = await call(admin.cookie, 'POST', '/api/transcripts/create', { transcript: 'x' });
  assert.equal(r.status, 422);
  assert.equal(r.data.issues.length, 4);
  assert.deepEqual(counts(), before);
  assert.ok(r.data.draft);
  // correction + revalidation
  const fixed = r.data.draft;
  fixed.projects[0].tasks[0].assigneeId = 'DEV01';
  fixed.projects[1].tasks[0].deadline = '2026-10-12';
  fixed.projects[2].managerId = 'PM03';
  fixed.projects[2].tasks[0].estimatedHours = 10;
  const ok = await call(admin.cookie, 'POST', '/api/transcripts/commit', { draft: fixed });
  assert.equal(ok.status, 201);
  assert.equal(counts().p, before.p + 3);
});

test('AI failure and unreadable output save nothing', async () => {
  const admin = await login('admin@novaworks.example');
  const before = counts();
  aiReply = 'Sorry, I cannot do that.';
  const r = await call(admin.cookie, 'POST', '/api/transcripts/create', { transcript: 'x' });
  assert.equal(r.status, 502);
  assert.deepEqual(counts(), before);
});

test('reset removes projects and tasks but keeps users', async () => {
  const admin = await login('admin@novaworks.example');
  const r = await call(admin.cookie, 'POST', '/api/admin/reset');
  assert.equal(r.status, 200);
  assert.deepEqual(counts(), { p: 0, t: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 10);
});

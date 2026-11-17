(() => {
  const app = document.getElementById('app');
  let me = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : esc(d); };
  const fmtHours = (h) => `${Number(h)} h`;
  const ROLE = { ADMIN: 'Administrator', MANAGER: 'Manager', AGENT: 'Agent' };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (res.status === 401 && path !== '/api/login' && path !== '/api/me') { me = null; renderLogin('Your session ended. Please log in again.'); throw new Error('unauthenticated'); }
    if (!res.ok) { const err = new Error((data && data.error) || `Request failed (${res.status})`); err.data = data; err.status = res.status; throw err; }
    return data;
  }

  // ---------- login ----------
  const DEMO = [['Admin', 'admin'], ['Ayesha', 'ayesha'], ['Bilal', 'bilal'], ['Hina', 'hina'], ['Ali', 'ali'], ['Hamza', 'hamza'], ['Sara', 'sara'], ['Usman', 'usman'], ['Zain', 'zain'], ['Maryam', 'maryam']];

  function renderLogin(message) {
    app.innerHTML = `
      <div class="login-wrap"><div class="card login">
        <div class="brand">NovaWorks Project CRM</div>
        <form id="loginForm" novalidate>
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="username" required>
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" required>
          <div class="row"><button class="btn" type="submit" id="loginBtn">Log in</button></div>
          <div id="loginMsg">${message ? `<div class="msg err" role="alert">${esc(message)}</div>` : ''}</div>
        </form>
        <p class="hint">Demo accounts use <code>name@novaworks.example</code> and password <code>Demo123!</code>. Pick one to fill the form:</p>
        <div class="quick">${DEMO.map(([n, k]) => `<button type="button" data-fill="${k}">${n}</button>`).join('')}</div>
      </div></div>`;
    app.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => {
      document.getElementById('email').value = `${b.dataset.fill}@novaworks.example`;
      document.getElementById('password').value = 'Demo123!';
    }));
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const box = document.getElementById('loginMsg');
      btn.disabled = true;
      try {
        const { user } = await api('/api/login', { method: 'POST', body: { email: document.getElementById('email').value, password: document.getElementById('password').value } });
        me = user;
        location.hash = homeFor(me);
        renderRoute();
      } catch (err) {
        box.innerHTML = `<div class="msg err" role="alert">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  const homeFor = (u) => (u.role === 'AGENT' ? '#/my-tasks' : '#/projects');

  // ---------- shell ----------
  function shell(active, html) {
    const links = [];
    if (me.role === 'AGENT') links.push(['#/my-tasks', 'My Tasks']);
    links.push(['#/projects', me.role === 'ADMIN' ? 'All Projects' : me.role === 'MANAGER' ? 'My Projects' : 'Related Projects']);
    if (me.role === 'ADMIN') links.push(['#/create', 'Create from Transcript']);
    links.push(['#/team', 'Team']);
    app.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="brand">NovaWorks<small>Project CRM</small></div>
          <nav class="nav" aria-label="Main">${links.map(([h, t]) => `<a href="${h}" class="${active === h ? 'active' : ''}">${t}</a>`).join('')}</nav>
          <div class="who"><strong>${esc(me.name)}</strong>${ROLE[me.role]}<br><button class="btn secondary" id="logoutBtn" style="margin-top:.6rem">Log out</button></div>
        </aside>
        <main class="main" id="main">${html}</main>
      </div>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
      me = null; location.hash = ''; renderLogin();
    });
  }
  const loading = (active) => shell(active, '<p>Loading…</p>');
  const showError = (active, err) => shell(active, `<div class="msg err" role="alert">${esc(err.message)}</div>`);

  // ---------- views ----------
  async function viewProjects() {
    loading('#/projects');
    try {
      const { projects } = await api('/api/projects');
      const title = me.role === 'ADMIN' ? 'All projects' : me.role === 'MANAGER' ? 'My projects' : 'Projects I work on';
      const body = projects.length
        ? `<div class="grid">${projects.map((p) => `
            <a class="card" href="#/project/${esc(p.id)}">
              <h2>${esc(p.name)}</h2>
              <div class="client">${esc(p.clientName)}</div>
              <div class="meta"><span>Manager: <b>${esc(p.managerName)}</b></span><span>Deadline: <b>${fmtDate(p.deadline)}</b></span></div>
              <div class="meta"><span class="pill">${p.taskCount} task${p.taskCount === 1 ? '' : 's'}</span><span class="pill">${p.totalHours} h</span></div>
            </a>`).join('')}</div>`
        : `<div class="empty">${me.role === 'ADMIN' ? 'No projects yet. Open <a href="#/create">Create from Transcript</a> to generate them from a meeting.' : 'No projects are assigned to you yet.'}</div>`;
      shell('#/projects', `<h1>${title}</h1><p class="client">${projects.length} project${projects.length === 1 ? '' : 's'}</p>${body}`);
    } catch (e) { if (e.message !== 'unauthenticated') showError('#/projects', e); }
  }

  async function viewProject(id) {
    loading('#/projects');
    try {
      const { project: p } = await api(`/api/projects/${encodeURIComponent(id)}`);
      const rows = p.tasks.map((t) => `<tr>
          <td><b>${esc(t.title)}</b></td><td class="desc">${esc(t.description)}</td>
          <td>${esc(t.assigneeName)}</td><td>${fmtDate(t.deadline)}</td><td class="num">${fmtHours(t.estimatedHours)}</td></tr>`).join('');
      const label = me.role === 'AGENT' ? 'Your tasks in this project' : 'Tasks';
      shell('#/projects', `
        <a class="back" href="#/projects">← Back to projects</a>
        <h1>${esc(p.name)}</h1>
        <div class="card">
          <div class="meta"><span>Client: <b>${esc(p.clientName)}</b></span><span>Manager: <b>${esc(p.managerName)}</b></span><span>Deadline: <b>${fmtDate(p.deadline)}</b></span></div>
          <p style="margin-top:.75rem" class="desc">${esc(p.description)}</p>
        </div>
        <h2 style="margin-top:1.25rem">${label} (${p.tasks.length})</h2>
        ${p.tasks.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Task</th><th>Description</th><th>Assigned agent</th><th>Deadline</th><th class="num">Est. hours</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : '<div class="empty">No tasks to show.</div>'}`);
    } catch (e) {
      if (e.message === 'unauthenticated') return;
      shell('#/projects', `<a class="back" href="#/projects">← Back to projects</a><div class="msg err" role="alert">${esc(e.message)}</div>`);
    }
  }

  async function viewMyTasks() {
    if (me.role !== 'AGENT') { location.hash = '#/projects'; return; }
    loading('#/my-tasks');
    try {
      const { tasks } = await api('/api/my-tasks');
      const rows = tasks.map((t) => `<tr>
          <td><b>${esc(t.title)}</b></td><td class="desc">${esc(t.description)}</td>
          <td><a href="#/project/${esc(t.projectId)}">${esc(t.projectName)}</a><br><span class="client">${esc(t.clientName)} · Manager ${esc(t.managerName)}</span></td>
          <td>${fmtDate(t.deadline)}</td><td class="num">${fmtHours(t.estimatedHours)}</td></tr>`).join('');
      shell('#/my-tasks', `<h1>My tasks</h1><p class="client">${tasks.length} task${tasks.length === 1 ? '' : 's'} assigned to ${esc(me.name)}</p>
        ${tasks.length ? `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Description</th><th>Project</th><th>Deadline</th><th class="num">Est. hours</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No tasks are assigned to you yet.</div>'}`);
    } catch (e) { if (e.message !== 'unauthenticated') showError('#/my-tasks', e); }
  }

  async function viewTeam() {
    loading('#/team');
    try {
      const { team } = await api('/api/team');
      shell('#/team', `<h1>Team directory</h1><p class="client">Read-only list of NovaWorks staff.</p>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Specialization</th><th>Skills</th></tr></thead><tbody>
        ${team.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${ROLE[u.role]}</td><td>${esc(u.specialization)}</td><td>${esc(u.skills.join(', '))}</td></tr>`).join('')}
        </tbody></table></div>`);
    } catch (e) { if (e.message !== 'unauthenticated') showError('#/team', e); }
  }

  function viewCreate() {
    if (me.role !== 'ADMIN') { location.hash = homeFor(me); return; }
    shell('#/create', `
      <h1>Create from Transcript</h1>
      <p>Paste the meeting transcript. The AI will create the projects and tasks, assign managers and developers from the team directory, and set deadlines and estimated hours.</p>
      <label for="transcript">Meeting transcript</label>
      <textarea id="transcript" placeholder="Paste the meeting description or transcript here…"></textarea>
      <div class="row">
        <button class="btn" id="createBtn">Create from Transcript</button>
        <button class="btn secondary" id="sampleBtn" type="button">Load supplied transcript</button>
        <button class="btn danger" id="resetBtn" type="button">Delete generated projects and tasks</button>
      </div>
      <div id="result" aria-live="polite"></div>`);

    const result = document.getElementById('result');
    const createBtn = document.getElementById('createBtn');
    const transcript = document.getElementById('transcript');

    document.getElementById('sampleBtn').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/sample-transcript', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Could not load the supplied transcript.');
        transcript.value = await res.text();
      } catch (e) { result.innerHTML = `<div class="msg err" role="alert">${esc(e.message)}</div>`; }
    });

    document.getElementById('resetBtn').addEventListener('click', async () => {
      if (!confirm('Delete all generated projects and tasks? Users are kept.')) return;
      try {
        const r = await api('/api/admin/reset', { method: 'POST' });
        result.innerHTML = `<div class="msg ok">Deleted ${r.projects} project(s) and ${r.tasks} task(s). Users were kept.</div>`;
      } catch (e) { result.innerHTML = `<div class="msg err" role="alert">${esc(e.message)}</div>`; }
    });

    function showSuccess(r) {
      result.innerHTML = `<div class="msg ok" role="status"><b>Created ${r.created.length} project${r.created.length === 1 ? '' : 's'} with ${r.totalTasks} task${r.totalTasks === 1 ? '' : 's'}.</b></div>
        <div class="grid">${r.created.map((p) => `<a class="card" href="#/project/${esc(p.id)}"><h2>${esc(p.name)}</h2><div class="client">${esc(p.clientName)}</div>
          <div class="meta"><span>Deadline: <b>${fmtDate(p.deadline)}</b></span><span class="pill">${p.taskCount} tasks</span></div></a>`).join('')}</div>
        <div class="row"><a class="btn" href="#/projects" style="text-decoration:none">View all projects</a></div>`;
    }

    function showProblems(err) {
      const issues = (err.data && err.data.issues) || [];
      const draft = err.data && err.data.draft;
      result.innerHTML = `<div class="msg err" role="alert"><b>${esc(err.message)}</b>
        ${issues.length ? `<ul>${issues.map((i) => `<li><code>${esc(i.path)}</code>: ${esc(i.message)}</li>`).join('')}</ul>` : ''}</div>
        ${draft ? `<label for="draftJson">Correct the result below, then save</label>
        <textarea id="draftJson" class="json" spellcheck="false">${esc(JSON.stringify(draft, null, 2))}</textarea>
        <p class="hint">Manager ids: PM01 Ayesha, PM02 Bilal, PM03 Hina. Agent ids: DEV01 Ali, DEV02 Hamza, DEV03 Sara, DEV04 Usman, DEV05 Zain, DEV06 Maryam. Dates use YYYY-MM-DD.</p>
        <div class="row"><button class="btn" id="commitBtn">Revalidate and save</button></div>` : ''}`;
      const commit = document.getElementById('commitBtn');
      if (commit) commit.addEventListener('click', async () => {
        let parsed;
        try { parsed = JSON.parse(document.getElementById('draftJson').value); }
        catch { result.insertAdjacentHTML('afterbegin', '<div class="msg err" role="alert">The corrected text is not valid JSON. Check commas and quotes.</div>'); return; }
        commit.disabled = true; commit.textContent = 'Saving…';
        try { showSuccess(await api('/api/transcripts/commit', { method: 'POST', body: { draft: parsed } })); }
        catch (e) { if (e.message !== 'unauthenticated') showProblems(e); }
      });
    }

    createBtn.addEventListener('click', async () => {
      if (createBtn.disabled) return;
      if (!transcript.value.trim()) { result.innerHTML = '<div class="msg err" role="alert">The transcript is empty. Paste the meeting text first.</div>'; return; }
      createBtn.disabled = true;
      createBtn.innerHTML = '<span class="spinner"></span>Reading the meeting…';
      result.innerHTML = '<div class="msg warn" role="status">The AI is reading the transcript. This usually takes 10 to 40 seconds. Please do not close this page.</div>';
      try {
        showSuccess(await api('/api/transcripts/create', { method: 'POST', body: { transcript: transcript.value } }));
      } catch (e) {
        if (e.message === 'unauthenticated') return;
        if (e.status === 422) showProblems(e);
        else result.innerHTML = `<div class="msg err" role="alert">${esc(e.message)}</div>`;
      } finally {
        createBtn.disabled = false; createBtn.textContent = 'Create from Transcript';
      }
    });
  }

  // ---------- router ----------
  function renderRoute() {
    if (!me) { renderLogin(); return; }
    const h = location.hash || homeFor(me);
    if (h.startsWith('#/project/')) return viewProject(decodeURIComponent(h.slice('#/project/'.length)));
    if (h === '#/my-tasks') return viewMyTasks();
    if (h === '#/create') return viewCreate();
    if (h === '#/team') return viewTeam();
    return viewProjects();
  }
  window.addEventListener('hashchange', renderRoute);

  (async function init() {
    try { me = (await api('/api/me')).user; } catch { me = null; }
    if (me) renderRoute(); else renderLogin();
  })();
})();

/* =========================================================
   New Horizon School — ERP App Logic (Firebase-connected)
   ========================================================= */
import { DB, subscribeAll, login, logout, watchAuth, seedIfEmpty } from "./erp-data.js";

const App = { role: null, userId: null, name: null, activeChildId: null, lastView: { admin: "dashboard", teacher: "dashboard", parent: "dashboard" } };
let unsubscribeData = null;

/* ---------------- helpers ---------------- */
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function esc(str) { return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove("show"), 2400); }
function switchView(id) { $all(".view").forEach((v) => v.classList.remove("active")); $(`#${id}`).classList.add("active"); }
function feeBadge(status) { const map = { paid: "green", pending: "gold", overdue: "red" }; return `<span class="badge ${map[status] || "navy"}">${esc(status)}</span>`; }
function attBadge(status) { const map = { present: "green", absent: "red", leave: "gold" }; return `<span class="badge ${map[status] || "navy"}">${esc(status)}</span>`; }
function setDates() {
  const label = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  ["admin-date", "teacher-date", "parent-date"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = label; });
}
function setBusy(form, busy) { $all("button[type=submit], button", form).forEach((b) => (b.disabled = busy)); }

/* =========================================================
   LOGIN (real Firebase Authentication)
   ========================================================= */
function initLogin() {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    $("#login-err").classList.remove("show");
    setBusy(e.target, true);
    try {
      const profile = await login(email, password);
      enterPortal(profile);
    } catch (err) {
      $("#login-err").textContent = friendlyAuthError(err);
      $("#login-err").classList.add("show");
    } finally {
      setBusy(e.target, false);
    }
  });

  $all("[data-logout]").forEach((el) => el.addEventListener("click", async (e) => {
    e.preventDefault();
    if (unsubscribeData) { unsubscribeData(); unsubscribeData = null; }
    await logout();
    App.role = null; App.userId = null; App.activeChildId = null;
    switchView("view-login");
    toast("You have been logged out.");
  }));

  $all("[data-menu-toggle]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.dataset.menuToggle;
    $(`#${key}-sidebar`).classList.add("open");
    $(`#${key}-overlay`).classList.add("show");
  }));
  $all(".sidebar-overlay").forEach((ov) => ov.addEventListener("click", () => {
    $all(".erp-sidebar").forEach((s) => s.classList.remove("open"));
    $all(".sidebar-overlay").forEach((o) => o.classList.remove("show"));
  }));
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  return err?.message || "Couldn't sign in. Please try again.";
}

function enterPortal(profile) {
  App.role = profile.role;
  App.userId = profile.refId;
  App.name = profile.name;
  setDates();

  if (!unsubscribeData) {
    unsubscribeData = subscribeAll(() => {
      // fires on first load AND on every live change from Firestore
      if (App.role) renderCurrent();
    });
  }

  if (profile.role === "admin") {
    switchView("view-admin");
    bindNav("admin", (v) => { App.lastView.admin = v; renderAdminView(v); });
    renderAdminView(App.lastView.admin);
  } else if (profile.role === "teacher") {
    switchView("view-teacher");
    bindNav("teacher", (v) => { App.lastView.teacher = v; renderTeacherView(v); });
    renderTeacherView(App.lastView.teacher);
  } else if (profile.role === "parent") {
    switchView("view-parent");
    bindNav("parent", (v) => { App.lastView.parent = v; renderParentView(v); });
    renderParentView(App.lastView.parent);
  }
}

function renderCurrent() {
  if (App.role === "admin") { $("#teacher-name") && updateTeacherHeader(); renderAdminView(App.lastView.admin); }
  else if (App.role === "teacher") { updateTeacherHeader(); renderTeacherView(App.lastView.teacher); }
  else if (App.role === "parent") { updateParentHeader(); renderParentView(App.lastView.parent); }
}
function updateTeacherHeader() {
  const t = DB.teacherById(App.userId);
  if (!t) return;
  $("#teacher-name").textContent = t.name;
  $("#teacher-subject").textContent = `${t.subject} Teacher`;
  $("#teacher-avatar").textContent = t.name.replace(/^(Mrs\.|Mr\.|Ms\.)\s*/, "").charAt(0);
}
function updateParentHeader() {
  const p = DB.parentById(App.userId);
  if (!p) return;
  $("#parent-name").textContent = p.name;
  $("#parent-avatar").textContent = p.name.charAt(0);
}

function bindNav(portal, renderFn) {
  const nav = $(`#${portal}-nav`);
  $all(".nav-item", nav).forEach((btn) => {
    btn.onclick = () => {
      $all(".nav-item", nav).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderFn(btn.dataset.view);
      $(`#${portal}-sidebar`).classList.remove("open");
      $(`#${portal}-overlay`).classList.remove("show");
      window.scrollTo(0, 0);
    };
  });
}

/* =========================================================
   ADMIN PORTAL
   ========================================================= */
function renderAdminView(view) {
  const titles = {
    dashboard: ["Dashboard", "School-wide overview"], students: ["Students", "Manage student records"],
    teachers: ["Teachers", "Manage staff records"], classes: ["Classes", "Sections and class teachers"],
    attendance: ["Attendance", "School-wide attendance overview"], fees: ["Fee Management", "Track dues and collection"],
    announcements: ["Announcements", "Post notices to staff and parents"],
  };
  $("#admin-title").textContent = titles[view][0];
  $("#admin-subtitle").textContent = titles[view][1];
  const c = $("#admin-content");
  if (view === "dashboard") c.innerHTML = adminDashboardHTML();
  else if (view === "students") { c.innerHTML = adminStudentsHTML(); bindAdminStudents(); }
  else if (view === "teachers") { c.innerHTML = adminTeachersHTML(); bindAdminTeachers(); }
  else if (view === "classes") c.innerHTML = adminClassesHTML();
  else if (view === "attendance") c.innerHTML = adminAttendanceHTML();
  else if (view === "fees") { c.innerHTML = adminFeesHTML(); bindAdminFees(); }
  else if (view === "announcements") { c.innerHTML = adminAnnouncementsHTML(); bindAdminAnnouncements(); }
}

function adminDashboardHTML() {
  const totalStudents = DB.students.length, totalTeachers = DB.teachers.length;
  const attToday = DB.schoolAttendanceToday();
  const totalDue = DB.fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.amount, 0);
  const recent = [...DB.announcements].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
  const seedNote = DB.classes.length === 0
    ? `<div class="panel"><div class="panel-body"><p style="margin-bottom:.8rem;">This school's database is empty. Load sample data to explore the ERP, or start adding real students and teachers below.</p><button class="btn gold" id="seed-btn">Load Sample Data</button></div></div>`
    : "";
  return `
  ${seedNote}
  <div class="stat-grid">
    <div class="stat-card accent-navy"><div class="label">Total Students</div><div class="value">${totalStudents}</div><div class="delta">across ${DB.classes.length} sections</div></div>
    <div class="stat-card accent-gold"><div class="label">Total Teachers</div><div class="value">${totalTeachers}</div><div class="delta">active staff</div></div>
    <div class="stat-card accent-green"><div class="label">Attendance Today</div><div class="value">${attToday === null ? "—" : attToday + "%"}</div><div class="delta ${attToday && attToday>=90?'up':'down'}">${attToday===null?"not marked yet":"present school-wide"}</div></div>
    <div class="stat-card accent-red"><div class="label">Fees Outstanding</div><div class="value">&#8377;${totalDue.toLocaleString("en-IN")}</div><div class="delta down">pending + overdue</div></div>
  </div>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h2>Classes at a glance</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Class</th><th>Class Teacher</th><th>Students</th></tr></thead>
        <tbody>${DB.classes.map((cl) => `<tr><td>${esc(cl.name)}-${esc(cl.section)}</td><td>${esc(DB.teacherById(cl.classTeacherId)?.name || "—")}</td><td>${DB.studentsInClass(cl.id).length}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">No classes yet.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Recent announcements</h2></div>
      <div class="panel-body">${recent.map((a) => `<div style="margin-bottom:1rem;"><div style="font-weight:600;font-size:.87rem;">${esc(a.title)}</div><div style="font-size:.78rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("") || `<div class="empty">No announcements yet.</div>`}</div>
    </div>
  </div>`;
}

function adminStudentsHTML() {
  const rows = DB.students.map((s) => `
    <tr><td>${esc(s.name)}</td><td>${DB.classLabel(s.classId)}</td><td>${s.roll}</td>
      <td>${esc(DB.parentById(s.parentId)?.name || "Not linked")}</td><td>${DB.attendancePct(s.id) ?? "—"}%</td>
      <td><button class="btn sm danger" data-remove-student="${s.id}">Remove</button></td></tr>`).join("");
  return `
  <div class="panel"><div class="panel-head"><h2>Add a student</h2></div>
    <div class="panel-body"><form id="add-student-form">
      <div class="form-row"><div><label>Full name</label><input type="text" id="s-name" required></div><div><label>Roll number</label><input type="number" id="s-roll" required min="1"></div></div>
      <div class="form-row"><div><label>Class</label><select id="s-class">${DB.classes.map((c) => `<option value="${c.id}">${esc(c.name)}-${esc(c.section)}</option>`).join("")}</select></div>
        <div><label>Link to parent (optional)</label><select id="s-parent"><option value="">— none —</option>${DB.parents.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div></div>
      <button class="btn gold" type="submit">Add Student</button>
    </form></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>All students (${DB.students.length})</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Class</th><th>Roll</th><th>Parent</th><th>Attendance</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty">No students yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminStudents() {
  $("#add-student-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try { await DB.addStudent($("#s-name").value.trim(), $("#s-class").value, $("#s-roll").value, $("#s-parent").value || null); toast("Student added."); }
    catch (err) { toast("Couldn't save — " + err.message); }
    setBusy(e.target, false);
  });
  $all("[data-remove-student]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this student from records?")) { await DB.removeStudent(btn.dataset.removeStudent); toast("Student removed."); }
  }));
}

function adminTeachersHTML() {
  const rows = DB.teachers.map((t) => `
    <tr><td>${esc(t.name)}</td><td>${esc(t.subject)}</td><td>${esc(t.phone || "")}</td>
      <td>${DB.classesForTeacher(t.id).map((c) => `${esc(c.name)}-${esc(c.section)}`).join(", ") || "—"}</td>
      <td><button class="btn sm danger" data-remove-teacher="${t.id}">Remove</button></td></tr>`).join("");
  return `
  <div class="panel"><div class="panel-head"><h2>Add a teacher</h2></div>
    <div class="panel-body"><form id="add-teacher-form">
      <div class="form-row"><div><label>Full name</label><input type="text" id="t-name" required></div><div><label>Subject</label><input type="text" id="t-subject" required></div></div>
      <div class="form-row"><div><label>Phone</label><input type="text" id="t-phone"></div><div><label>Username</label><input type="text" id="t-username"></div></div>
      <button class="btn gold" type="submit">Add Teacher</button>
    </form>
    <div class="field-hint" style="margin-top:.6rem;">Adding a teacher here only creates their record. To give them a real login, also create their account in Firebase Authentication and a matching <code>users</code> document — see README.</div>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>All teachers (${DB.teachers.length})</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Subject</th><th>Phone</th><th>Classes</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty">No teachers yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminTeachers() {
  $("#add-teacher-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try { await DB.addTeacher($("#t-name").value.trim(), $("#t-subject").value.trim(), $("#t-phone").value.trim(), $("#t-username").value.trim()); toast("Teacher added."); }
    catch (err) { toast("Couldn't save — " + err.message); }
    setBusy(e.target, false);
  });
  $all("[data-remove-teacher]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this teacher from records?")) { await DB.removeTeacher(btn.dataset.removeTeacher); toast("Teacher removed."); }
  }));
}

function adminClassesHTML() {
  return `<div class="panel"><div class="panel-head"><h2>Classes &amp; sections</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Class Teacher</th><th>Students</th><th>Subjects</th></tr></thead>
      <tbody>${DB.classes.map((c) => `<tr><td>${esc(c.name)}-${esc(c.section)}</td><td>${esc(DB.teacherById(c.classTeacherId)?.name || "—")}</td><td>${DB.studentsInClass(c.id).length}</td><td class="wrap">${(DB.timetable[c.id]||[]).join(", ")}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No classes yet.</td></tr>`}</tbody>
    </table></div></div>`;
}

function adminAttendanceHTML() {
  const rows = DB.classes.map((c) => {
    const students = DB.studentsInClass(c.id);
    const pcts = students.map((s) => DB.attendancePct(s.id)).filter((p) => p !== null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    return `<tr><td>${esc(c.name)}-${esc(c.section)}</td><td>${students.length}</td><td>${avg===null?"—":avg+"%"}</td><td><div class="progress-bar"><span style="width:${avg||0}%"></span></div></td></tr>`;
  }).join("");
  return `<div class="panel"><div class="panel-head"><h2>Attendance by class</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Students</th><th>Avg. attendance</th><th style="width:160px;">Trend</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">No data yet.</td></tr>`}</tbody></table></div></div>`;
}

function adminFeesHTML() {
  const rows = DB.fees.map((f) => { const s = DB.studentById(f.studentId); return `<tr><td>${esc(s?.name || "—")}</td><td>${DB.classLabel(s?.classId)}</td><td>${esc(f.term)}</td><td>&#8377;${f.amount.toLocaleString("en-IN")}</td><td>${fmtDate(f.dueDate)}</td><td>${feeBadge(f.status)}</td><td>${f.status !== "paid" ? `<button class="btn sm outline" data-mark-paid="${f.id}">Mark Paid</button>` : "—"}</td></tr>`; }).join("");
  const collected = DB.fees.filter((f) => f.status === "paid").reduce((s, f) => s + f.amount, 0);
  const pending = DB.fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.amount, 0);
  return `<div class="stat-grid">
    <div class="stat-card accent-green"><div class="label">Collected</div><div class="value">&#8377;${collected.toLocaleString("en-IN")}</div></div>
    <div class="stat-card accent-red"><div class="label">Outstanding</div><div class="value">&#8377;${pending.toLocaleString("en-IN")}</div></div>
    <div class="stat-card accent-navy"><div class="label">Records</div><div class="value">${DB.fees.length}</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Fee records</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Term</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty">No fee records yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminFees() {
  $all("[data-mark-paid]").forEach((btn) => btn.addEventListener("click", async () => { await DB.markFeePaid(btn.dataset.markPaid); toast("Marked as paid."); }));
}

function adminAnnouncementsHTML() {
  const sorted = [...DB.announcements].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = sorted.map((a) => `<div class="panel-body" style="border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div style="font-weight:600;">${esc(a.title)}</div><span class="badge navy">${esc(a.audience)}</span></div><p style="margin:.4rem 0;">${esc(a.body)}</p><div style="font-size:.75rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Post an announcement</h2></div>
    <div class="panel-body"><form id="add-ann-form">
      <label>Title</label><input type="text" id="an-title" required>
      <label>Message</label><textarea id="an-body" required></textarea>
      <label>Audience</label><select id="an-audience"><option value="all">Everyone</option><option value="parents">Parents only</option><option value="teachers">Teachers only</option></select>
      <button class="btn gold" type="submit" style="margin-top:.4rem;">Post Announcement</button>
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>All announcements</h2></div>${rows || `<div class="empty">Nothing posted yet.</div>`}</div>`;
}
function bindAdminAnnouncements() {
  $("#add-ann-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try { await DB.addAnnouncement($("#an-title").value.trim(), $("#an-body").value.trim(), $("#an-audience").value, DB.admin.name); toast("Announcement posted."); }
    catch (err) { toast("Couldn't post — " + err.message); }
    setBusy(e.target, false);
  });
  const seedBtn = $("#seed-btn");
  if (seedBtn) seedBtn.addEventListener("click", async () => { seedBtn.disabled = true; seedBtn.textContent = "Loading…"; await seedIfEmpty(); toast("Sample data loaded."); });
}

/* =========================================================
   TEACHER PORTAL
   ========================================================= */
function currentTeacher() { return DB.teacherById(App.userId); }

function renderTeacherView(view) {
  const t = currentTeacher();
  if (!t) { $("#teacher-content").innerHTML = `<div class="empty">Your teacher record wasn't found. Ask the admin office to check your account.</div>`; return; }
  const titles = {
    dashboard: ["Dashboard", `Welcome back, ${t.name}`], attendance: ["Take Attendance", "Mark today's attendance"],
    marks: ["Enter Marks", "Record exam marks"], homework: ["Homework", "Assign and review homework"],
    students: ["My Class", "Students you teach"], announcements: ["Announcements", "Notices from the school"],
  };
  $("#teacher-title").textContent = titles[view][0];
  $("#teacher-subtitle").textContent = titles[view][1];
  const c = $("#teacher-content");
  if (view === "dashboard") c.innerHTML = teacherDashboardHTML(t);
  else if (view === "attendance") { c.innerHTML = teacherAttendanceHTML(t); bindTeacherAttendance(t); }
  else if (view === "marks") { c.innerHTML = teacherMarksHTML(t); bindTeacherMarks(t); }
  else if (view === "homework") { c.innerHTML = teacherHomeworkHTML(t); bindTeacherHomework(t); }
  else if (view === "students") c.innerHTML = teacherStudentsHTML(t);
  else if (view === "announcements") c.innerHTML = renderAnnouncementsList(DB.announcementsFor("teachers"));
}

function teacherDashboardHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  const totalStudents = classes.reduce((s, c) => s + DB.studentsInClass(c.id).length, 0);
  const hwCount = DB.homework.filter((h) => classes.some((c) => c.id === h.classId)).length;
  return `<div class="stat-grid">
    <div class="stat-card accent-navy"><div class="label">Your Classes</div><div class="value">${classes.length}</div></div>
    <div class="stat-card accent-gold"><div class="label">Your Students</div><div class="value">${totalStudents}</div></div>
    <div class="stat-card accent-green"><div class="label">Homework Posted</div><div class="value">${hwCount}</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Your classes</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Students</th></tr></thead>
      <tbody>${classes.map((c) => `<tr><td>${esc(c.name)}-${esc(c.section)}</td><td>${esc(t.subject)}</td><td>${DB.studentsInClass(c.id).length}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">No classes assigned.</td></tr>`}</tbody>
    </table></div></div>`;
}

function teacherAttendanceHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(c.name)}-${esc(c.section)}</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Mark attendance</h2>
    <div class="pill-filter"><select id="att-class">${classOptions}</select><input type="date" id="att-date" value="${DB.todayISO()}"></div></div>
    <div class="panel-body"><div class="att-list" id="att-list"></div><button class="btn gold" id="save-att" style="margin-top:1rem;">Save Attendance</button></div>
  </div>`;
}
function renderAttendanceList() {
  const classId = $("#att-class").value, date = $("#att-date").value;
  const students = DB.studentsInClass(classId);
  const existing = {};
  DB.attendance.filter((a) => a.date === date).forEach((a) => (existing[a.studentId] = a.status));
  $("#att-list").innerHTML = students.map((s) => {
    const st = existing[s.id] || "present";
    return `<div class="att-row" data-student="${s.id}"><div><div class="name">${esc(s.name)}</div><div class="roll">Roll No. ${s.roll}</div></div>
      <div class="att-toggle"><button type="button" class="present ${st==='present'?'on':''}" data-status="present">Present</button>
        <button type="button" class="absent ${st==='absent'?'on':''}" data-status="absent">Absent</button>
        <button type="button" class="leave ${st==='leave'?'on':''}" data-status="leave">Leave</button></div></div>`;
  }).join("") || `<div class="empty">No students in this class.</div>`;
  $all(".att-toggle button", $("#att-list")).forEach((btn) => btn.addEventListener("click", () => {
    const row = btn.closest(".att-row");
    $all("button", row.querySelector(".att-toggle")).forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
  }));
}
function bindTeacherAttendance(t) {
  renderAttendanceList();
  $("#att-class").addEventListener("change", renderAttendanceList);
  $("#att-date").addEventListener("change", renderAttendanceList);
  $("#save-att").addEventListener("click", async (e) => {
    const classId = $("#att-class").value, date = $("#att-date").value;
    const entries = $all(".att-row", $("#att-list")).map((row) => ({ studentId: row.dataset.student, status: $(".att-toggle .on", row)?.dataset.status || "present" }));
    e.target.disabled = true;
    try { await DB.markAttendance(classId, date, entries, t.id); toast(`Attendance saved for ${DB.classLabel(classId)}.`); }
    catch (err) { toast("Couldn't save — " + err.message); }
    e.target.disabled = false;
  });
}

function teacherMarksHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(c.name)}-${esc(c.section)}</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Enter marks</h2>
    <div class="pill-filter"><select id="mk-class">${classOptions}</select><input type="text" id="mk-exam" value="Term 2" style="width:160px;"><input type="number" id="mk-max" value="50" style="width:100px;"></div></div>
    <div class="panel-body"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Roll</th><th style="width:140px;">Marks</th></tr></thead><tbody id="mk-body"></tbody></table></div>
    <button class="btn gold" id="save-marks" style="margin-top:1rem;">Save Marks</button></div>
  </div>`;
}
function renderMarksTable(t) {
  const classId = $("#mk-class").value, students = DB.studentsInClass(classId);
  $("#mk-body").innerHTML = students.map((s) => {
    const existing = DB.marks.find((m) => m.studentId === s.id && m.subject === t.subject && m.exam === $("#mk-exam").value);
    return `<tr data-student="${s.id}"><td>${esc(s.name)}</td><td>${s.roll}</td><td><input type="number" min="0" class="mk-input" value="${existing ? existing.marks : ""}" style="margin:0;"></td></tr>`;
  }).join("") || `<tr><td colspan="3" class="empty">No students in this class.</td></tr>`;
}
function bindTeacherMarks(t) {
  renderMarksTable(t);
  $("#mk-class").addEventListener("change", () => renderMarksTable(t));
  $("#save-marks").addEventListener("click", async (e) => {
    const max = Number($("#mk-max").value) || 50, exam = $("#mk-exam").value.trim() || "Term";
    e.target.disabled = true;
    let count = 0;
    try {
      for (const row of $all("tr", $("#mk-body"))) {
        const input = row.querySelector(".mk-input");
        if (input && input.value !== "") { await DB.addMarks(row.dataset.student, t.subject, exam, Number(input.value), max); count++; }
      }
      toast(`Saved marks for ${count} student(s).`);
    } catch (err) { toast("Couldn't save — " + err.message); }
    e.target.disabled = false;
  });
}

function teacherHomeworkHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(c.name)}-${esc(c.section)}</option>`).join("");
  const list = DB.homework.filter((h) => classes.some((c) => c.id === h.classId));
  return `<div class="panel"><div class="panel-head"><h2>Assign homework</h2></div>
    <div class="panel-body"><form id="hw-form">
      <div class="form-row"><div><label>Class</label><select id="hw-class">${classOptions}</select></div><div><label>Due date</label><input type="date" id="hw-due" value="${DB.isoDaysAgo(-3)}"></div></div>
      <label>Details</label><textarea id="hw-desc" required></textarea>
      <button class="btn gold" type="submit">Post Homework</button>
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>Posted homework</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Details</th><th>Due</th></tr></thead>
      <tbody>${list.map((h) => `<tr><td>${DB.classLabel(h.classId)}</td><td>${esc(h.subject)}</td><td class="wrap">${esc(h.description)}</td><td>${fmtDate(h.dueDate)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nothing posted yet.</td></tr>`}</tbody>
    </table></div></div>`;
}
function bindTeacherHomework(t) {
  $("#hw-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try { await DB.addHomework($("#hw-class").value, t.subject, $("#hw-desc").value.trim(), $("#hw-due").value, t.id); toast("Homework posted."); }
    catch (err) { toast("Couldn't post — " + err.message); }
    setBusy(e.target, false);
  });
}

function teacherStudentsHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  return classes.map((c) => { const students = DB.studentsInClass(c.id); return `<div class="panel"><div class="panel-head"><h2>${esc(c.name)}-${esc(c.section)} (${students.length} students)</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Roll</th><th>Name</th><th>Attendance</th><th>Parent</th></tr></thead>
      <tbody>${students.map((s) => `<tr><td>${s.roll}</td><td>${esc(s.name)}</td><td>${DB.attendancePct(s.id) ?? "—"}%</td><td>${esc(DB.parentById(s.parentId)?.name || "Not linked")}</td></tr>`).join("")}</tbody></table></div></div>`; }).join("") || `<div class="empty">No classes assigned.</div>`;
}

/* =========================================================
   PARENT PORTAL
   ========================================================= */
function currentParent() { return DB.parentById(App.userId); }

function renderParentView(view) {
  const p = currentParent();
  if (!p) { $("#parent-content").innerHTML = `<div class="empty">Your parent record wasn't found. Ask the admin office to check your account.</div>`; return; }
  const kids = DB.childrenOf(p.id);
  if (!App.activeChildId && kids.length) App.activeChildId = kids[0].id;
  if (App.activeChildId && !kids.some((k) => k.id === App.activeChildId)) App.activeChildId = kids[0]?.id || null;
  const child = DB.studentById(App.activeChildId);

  const titles = {
    dashboard: ["Dashboard", `Welcome back, ${p.name.split(" ")[0]}`], attendance: ["Attendance", child ? `${child.name}'s attendance record` : ""],
    grades: ["Grades & Report", child ? `${child.name}'s exam performance` : ""], fees: ["Fees", child ? `${child.name}'s fee status` : ""],
    homework: ["Homework", child ? `Homework for ${DB.classLabel(child.classId)}` : ""], announcements: ["Announcements", "Notices from the school"],
  };
  $("#parent-title").textContent = titles[view][0];
  $("#parent-subtitle").textContent = titles[view][1];
  const c = $("#parent-content");

  if (!kids.length) { c.innerHTML = `<div class="empty"><div class="big">&#128100;</div>No student is linked to this parent account yet.<br>Please contact the school office.</div>`; return; }

  const switcher = kids.length > 1 ? `<div class="child-switch">${kids.map((k) => `<button data-child="${k.id}" class="${k.id === App.activeChildId ? "active" : ""}">${esc(k.name)} · ${DB.classLabel(k.classId)}</button>`).join("")}</div>` : "";

  let body = "";
  if (view === "dashboard") body = parentDashboardHTML(child);
  else if (view === "attendance") body = parentAttendanceHTML(child);
  else if (view === "grades") body = parentGradesHTML(child);
  else if (view === "fees") body = parentFeesHTML(child);
  else if (view === "homework") body = parentHomeworkHTML(child);
  else if (view === "announcements") body = renderAnnouncementsList(DB.announcementsFor("parents"));

  c.innerHTML = (view !== "announcements" ? switcher : "") + body;
  $all("[data-child]", c).forEach((btn) => btn.addEventListener("click", () => { App.activeChildId = btn.dataset.child; renderParentView(view); }));
  if (view === "fees") bindParentFees();
}

function parentDashboardHTML(child) {
  const att = DB.attendancePct(child.id);
  const fees = DB.feesFor(child.id);
  const due = fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.amount, 0);
  const hw = DB.homeworkForClass(child.classId).slice(0, 3);
  return `<div class="stat-grid">
    <div class="stat-card accent-green"><div class="label">Attendance</div><div class="value">${att ?? "—"}%</div></div>
    <div class="stat-card accent-navy"><div class="label">Class</div><div class="value">${DB.classLabel(child.classId)}</div><div class="delta">Roll No. ${child.roll}</div></div>
    <div class="stat-card accent-red"><div class="label">Fees Due</div><div class="value">&#8377;${due.toLocaleString("en-IN")}</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Recent homework</h2></div>
    <div class="panel-body">${hw.map((h) => `<div style="margin-bottom:.9rem;"><div style="font-weight:600;font-size:.87rem;">${esc(h.subject)}</div><p style="margin:.15rem 0;">${esc(h.description)}</p><div style="font-size:.75rem;color:var(--ink-soft);">Due ${fmtDate(h.dueDate)}</div></div>`).join("") || `<div class="empty">No homework posted.</div>`}</div>
  </div>`;
}
function parentAttendanceHTML(child) {
  const rows = DB.attendanceFor(child.id), pct = DB.attendancePct(child.id);
  return `<div class="stat-grid"><div class="stat-card accent-green"><div class="label">Overall attendance</div><div class="value">${pct ?? "—"}%</div></div></div>
  <div class="panel"><div class="panel-head"><h2>Daily record</h2></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${attBadge(r.status)}</td></tr>`).join("") || `<tr><td colspan="2" class="empty">No attendance recorded yet.</td></tr>`}</tbody></table></div></div>`;
}
function parentGradesHTML(child) {
  const rows = DB.marksFor(child.id);
  return `<div class="panel"><div class="panel-head"><h2>Exam results</h2></div><div class="table-wrap"><table><thead><tr><th>Subject</th><th>Exam</th><th>Marks</th><th>%</th></tr></thead>
    <tbody>${rows.map((m) => `<tr><td>${esc(m.subject)}</td><td>${esc(m.exam)}</td><td>${m.marks} / ${m.max}</td><td>${Math.round((m.marks / m.max) * 100)}%</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No marks entered yet.</td></tr>`}</tbody></table></div></div>`;
}
function parentFeesHTML(child) {
  const rows = DB.feesFor(child.id);
  return `<div class="panel"><div class="panel-head"><h2>Fee records</h2></div><div class="table-wrap"><table><thead><tr><th>Term</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((f) => `<tr><td>${esc(f.term)}</td><td>&#8377;${f.amount.toLocaleString("en-IN")}</td><td>${fmtDate(f.dueDate)}</td><td>${feeBadge(f.status)}</td><td>${f.status !== "paid" ? `<button class="btn sm gold" data-pay="${f.id}">Pay Now</button>` : "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No fee records.</td></tr>`}</tbody></table></div></div>
  <div class="panel"><div class="panel-head"><h2>Note</h2></div><div class="panel-body"><p>Online payment isn't wired to a real payment gateway yet. In production this button would open Razorpay / Paytm / your bank's gateway.</p></div></div>`;
}
function bindParentFees() {
  $all("[data-pay]").forEach((btn) => btn.addEventListener("click", async () => { await DB.markFeePaid(btn.dataset.pay); toast("Payment recorded — thank you!"); }));
}
function parentHomeworkHTML(child) {
  const rows = DB.homeworkForClass(child.classId);
  return `<div class="panel"><div class="panel-head"><h2>Homework for ${DB.classLabel(child.classId)}</h2></div>
    <div class="panel-body">${rows.map((h) => `<div style="margin-bottom:1.1rem;padding-bottom:1.1rem;border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;"><strong>${esc(h.subject)}</strong><span style="font-size:.78rem;color:var(--ink-soft);">Due ${fmtDate(h.dueDate)}</span></div><p style="margin:.3rem 0 0;">${esc(h.description)}</p></div>`).join("") || `<div class="empty">No homework posted.</div>`}</div></div>`;
}

function renderAnnouncementsList(list) {
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<div class="panel"><div class="panel-head"><h2>Announcements</h2></div>
    ${sorted.map((a) => `<div class="panel-body" style="border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div style="font-weight:600;">${esc(a.title)}</div><span class="badge navy">${esc(a.audience)}</span></div><p style="margin:.4rem 0;">${esc(a.body)}</p><div style="font-size:.75rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("") || `<div class="empty">No announcements yet.</div>`}
  </div>`;
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  setDates();
  // If Firebase already has a signed-in session (e.g. after a page refresh), resume it.
  watchAuth(async (user) => {
    if (user && !App.role) {
      try {
        const { getDoc, doc, db } = await import("./firebase-init.js");
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) enterPortal(userDoc.data());
      } catch (err) { /* stay on login screen if this fails */ }
    }
  });
});
/* =========================================================
   New Horizon School — ERP App Logic (Firebase-connected)
   ========================================================= */
import { DB, subscribeAll, login, logout, watchAuth, seedIfEmpty, ensureStandardClasses } from "./erp-data.js";

const App = {
  role: null, userId: null, name: null, activeChildId: null,
  lastView: { admin: "dashboard", teacher: "dashboard", parent: "dashboard", reception: "dashboard" },
  feesFilter: { classId: "", q: "" },
  attFilter: { classId: "", q: "" },
  hwEditId: null,
  annEditId: null,
  searchQuery: "",
  gatepassFilter: { classId: "", q: "", roll: "", date: "" },
};
let unsubscribeData = null;

/* ---------------- helpers ---------------- */
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function esc(str) { return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function sortByPostedRecentFirst(a, b) {
  const ta = a.postedAt ?? new Date(a.postedDate || 0).getTime();
  const tb = b.postedAt ?? new Date(b.postedDate || 0).getTime();
  return tb - ta;
}
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
  if (code.includes("email-already-in-use")) return "That email already has a login. Leave the login fields blank if you just want to update the record.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  return err?.message || "Something went wrong. Please try again.";
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
  } else if (profile.role === "reception") {
    switchView("view-reception");
    bindNav("reception", (v) => { App.lastView.reception = v; renderReceptionView(v); });
    renderReceptionView(App.lastView.reception);
  }
}

function renderCurrent() {
  if (App.role === "admin") { renderAdminView(App.lastView.admin); }
  else if (App.role === "teacher") { updateTeacherHeader(); renderTeacherView(App.lastView.teacher); }
  else if (App.role === "parent") { updateParentHeader(); renderParentView(App.lastView.parent); }
  else if (App.role === "reception") { updateReceptionHeader(); renderReceptionView(App.lastView.reception); }
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
function updateReceptionHeader() {
  const r = DB.receptionistById(App.userId);
  if (!r) return;
  $("#reception-name").textContent = r.name;
  $("#reception-avatar").textContent = r.name.charAt(0);
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
    dashboard: ["Dashboard", "School-wide overview"], search: ["Search", "Find a student, parent, or enquiry"],
    students: ["Students", "Manage student records"],
    teachers: ["Teachers", "Manage staff records"], "reception-staff": ["Reception Staff", "Manage front-desk logins"], classes: ["Classes", "Sections and class teachers"],
    "take-attendance": ["Take Attendance", "Mark today's attendance for any class"],
    attendance: ["Attendance Overview", "School-wide attendance overview"],
    "marks-entry": ["Enter Marks", "Record exam marks for any class"],
    homework: ["Homework", "Post and manage homework for any class"],
    admissions: ["Admissions / Enquiry", "New enquiries and admission follow-ups"],
    visitors: ["Visitor Management", "Check visitors in and out"],
    gatepass: ["Gate Pass", "Generate and search gate pass records"],
    fees: ["Fee Management", "Track dues and collection"],
    announcements: ["Announcements", "Post notices to staff and parents"],
    messages: ["Messages", "Message parents directly"],
    reports: ["Reports", "Daily activity at a glance"],
  };
  $("#admin-title").textContent = titles[view][0];
  $("#admin-subtitle").textContent = titles[view][1];
  const c = $("#admin-content");
  if (view === "dashboard") c.innerHTML = adminDashboardHTML();
  else if (view === "search") { c.innerHTML = receptionSearchHTML(); bindReceptionSearch(); }
  else if (view === "students") { c.innerHTML = adminStudentsHTML(); bindAdminStudents(); }
  else if (view === "teachers") { c.innerHTML = adminTeachersHTML(); bindAdminTeachers(); }
  else if (view === "reception-staff") { c.innerHTML = adminReceptionHTML(); bindAdminReception(); }
  else if (view === "classes") { c.innerHTML = adminClassesHTML(); bindAdminClasses(); }
  else if (view === "take-attendance") { c.innerHTML = adminTakeAttendanceHTML(); bindAdminTakeAttendance(); }
  else if (view === "attendance") { c.innerHTML = adminAttendanceHTML(); bindAdminAttendance(); }
  else if (view === "marks-entry") { c.innerHTML = adminMarksHTML(); bindAdminMarks(); }
  else if (view === "homework") { c.innerHTML = adminHomeworkHTML(); bindAdminHomework(); }
  else if (view === "admissions") { c.innerHTML = receptionAdmissionsHTML(); bindReceptionAdmissions(); }
  else if (view === "visitors") { c.innerHTML = receptionVisitorsHTML(); bindReceptionVisitors(); }
  else if (view === "gatepass") { c.innerHTML = gatepassSectionHTML(); bindGatepassSection(DB.admin.name); }
  else if (view === "fees") { c.innerHTML = adminFeesHTML(); bindAdminFees(); }
  else if (view === "announcements") { c.innerHTML = adminAnnouncementsHTML(); bindAdminAnnouncements(); }
  else if (view === "messages") { c.innerHTML = receptionCommunicationHTML(); bindReceptionCommunication(DB.admin); }
  else if (view === "reports") c.innerHTML = receptionReportsHTML();
}

function adminReceptionHTML() {
  const rows = DB.receptionists.map((r) => `
    <tr><td>${esc(r.name)}</td><td>${esc(r.phone || "")}</td>
      <td><button class="btn sm danger" data-remove-reception="${r.id}">Remove</button></td></tr>`).join("");
  return `
  <div class="panel"><div class="panel-head"><h2>Add reception staff</h2></div>
    <div class="panel-body"><form id="add-reception-form">
      <div class="form-row"><div><label>Full name</label><input type="text" id="rc-name" required></div><div><label>Phone</label><input type="text" id="rc-phone"></div></div>
      <div class="form-row">
        <div><label>Login email <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="email" id="rc-email" placeholder="for their portal login"></div>
        <div><label>Login password <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="rc-password" placeholder="min. 6 characters"></div>
      </div>
      <div class="field-hint">Fill in email &amp; password to create their real sign-in right now, the same way as for teachers. Leave both blank to just save the record for later.</div>
      <button class="btn gold" type="submit">Add Reception Staff</button>
    </form></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>All reception staff (${DB.receptionists.length})</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="empty">No reception staff yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminReception() {
  $("#add-reception-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      await DB.addReceptionist($("#rc-name").value.trim(), $("#rc-phone").value.trim(), $("#rc-email").value.trim(), $("#rc-password").value);
      toast("Reception staff added.");
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-remove-reception]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this reception account?")) { await DB.removeReceptionist(btn.dataset.removeReception); toast("Reception staff removed."); }
  }));
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
        <tbody>${DB.classesSorted().map((cl) => `<tr><td>${esc(DB.classLabel(cl.id))}</td><td>${esc(DB.teacherById(cl.classTeacherId)?.name || "—")}</td><td>${DB.studentsInClass(cl.id).length}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">No classes yet.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Recent announcements</h2></div>
      <div class="panel-body">${recent.map((a) => `<div style="margin-bottom:1rem;"><div style="font-weight:600;font-size:.87rem;">${esc(a.title)}</div><div style="font-size:.78rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("") || `<div class="empty">No announcements yet.</div>`}</div>
    </div>
  </div>`;
}

function adminStudentsHTML() {
  const rows = DB.students.map((s) => `
    <tr><td>${esc(s.name)}</td><td>${esc(s.admissionNo || "—")}</td><td>${DB.classLabel(s.classId)}</td><td>${s.roll}</td>
      <td>${esc(DB.parentById(s.parentId)?.name || "Not linked")}</td><td>${DB.attendancePct(s.id) ?? "—"}%</td>
      <td><button class="btn sm danger" data-remove-student="${s.id}">Remove</button></td></tr>`).join("");
  const classOptions = DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  return `
  <div class="panel"><div class="panel-head"><h2>Add a student</h2></div>
    <div class="panel-body"><form id="add-student-form">
      <div class="form-row"><div><label>Full name</label><input type="text" id="s-name" required></div><div><label>Roll number</label><input type="number" id="s-roll" required min="1"></div></div>
      <div class="form-row"><div><label>Admission No. <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="s-admission-no" placeholder="e.g. NH-2026-041"></div>
        <div><label>Class</label><select id="s-class">${classOptions || `<option value="">No classes yet — set these up on the Classes tab</option>`}</select></div></div>
      <div class="form-row">
        <div><label>Parent's name</label><input type="text" id="s-parent-name" placeholder="e.g. Ritu Malhotra"></div>
        <div><label>Parent's phone <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="s-parent-phone" placeholder="10-digit mobile"></div>
      </div>
      <div class="form-row">
        <div><label>Parent's email <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="email" id="s-parent-email" placeholder="for their portal login"></div>
        <div><label>Parent's password <span style="font-weight:400;color:var(--ink-soft);">(optional — only if email is given)</span></label><input type="text" id="s-parent-password" placeholder="min. 6 characters"></div>
      </div>
      <div class="field-hint">If this parent already exists (same name), the student links to them and no new login is created. If it's a new name, a parent record is created — with a real login too, if you fill in email &amp; password.</div>
      <button class="btn gold" type="submit">Add Student</button>
    </form></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>All students (${DB.students.length})</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Admission No.</th><th>Class</th><th>Roll</th><th>Parent</th><th>Attendance</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty">No students yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminStudents() {
  $("#add-student-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      await DB.addStudent(
        $("#s-name").value.trim(), $("#s-class").value, $("#s-roll").value, $("#s-admission-no").value.trim(),
        $("#s-parent-name").value.trim(), $("#s-parent-phone").value.trim(), $("#s-parent-email").value.trim(), $("#s-parent-password").value
      );
      toast("Student added.");
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-remove-student]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this student from records?")) { await DB.removeStudent(btn.dataset.removeStudent); toast("Student removed."); }
  }));
}

function adminTeachersHTML() {
  const classCheckboxes = (t) => DB.classesSorted().map((c) => `
    <label style="display:flex;align-items:center;gap:.4rem;font-weight:400;font-size:.8rem;padding:.15rem 0;">
      <input type="checkbox" data-teacher-class="${t.id}" value="${c.id}" ${(t.classIds||[]).includes(c.id)?"checked":""} style="width:auto;margin:0;">
      ${esc(DB.classLabel(c.id))}
    </label>`).join("");
  const rows = DB.teachers.map((t) => `
    <tr><td>${esc(t.name)}</td><td>${esc(t.subject)}</td><td>${esc(t.phone || "")}</td>
      <td class="wrap"><div style="max-height:110px;overflow-y:auto;min-width:160px;">${classCheckboxes(t) || "No classes yet"}</div></td>
      <td><button class="btn sm danger" data-remove-teacher="${t.id}">Remove</button></td></tr>`).join("");
  return `
  <div class="panel"><div class="panel-head"><h2>Add a teacher</h2></div>
    <div class="panel-body"><form id="add-teacher-form">
      <div class="form-row"><div><label>Full name</label><input type="text" id="t-name" required></div><div><label>Subject</label><input type="text" id="t-subject" required></div></div>
      <div class="form-row"><div><label>Phone</label><input type="text" id="t-phone"></div><div><label>Username</label><input type="text" id="t-username"></div></div>
      <div class="form-row">
        <div><label>Login email <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="email" id="t-email" placeholder="for their portal login"></div>
        <div><label>Login password <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="t-password" placeholder="min. 6 characters"></div>
      </div>
      <div class="field-hint">Fill in email &amp; password to also create their real sign-in right now — no need to touch the Firebase console. Leave both blank to just save the record for later. Once added, tick which classes they teach in the table below.</div>
      <button class="btn gold" type="submit">Add Teacher</button>
    </form>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>All teachers (${DB.teachers.length})</h2></div>
    <div class="panel-body" style="padding-bottom:0;"><p style="margin:0 0 .6rem;">Tick the classes each teacher is assigned to — saves automatically.</p></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Subject</th><th>Phone</th><th>Classes taught</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty">No teachers yet.</td></tr>`}</tbody></table></div>
  </div>`;
}
function bindAdminTeachers() {
  $("#add-teacher-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      await DB.addTeacher(
        $("#t-name").value.trim(), $("#t-subject").value.trim(), $("#t-phone").value.trim(), $("#t-username").value.trim(),
        $("#t-email").value.trim(), $("#t-password").value
      );
      toast("Teacher added.");
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-remove-teacher]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this teacher from records?")) { await DB.removeTeacher(btn.dataset.removeTeacher); toast("Teacher removed."); }
  }));
  $all("[data-teacher-class]").forEach((cb) => cb.addEventListener("change", async () => {
    const teacherId = cb.dataset.teacherClass;
    const checked = $all(`[data-teacher-class="${teacherId}"]:checked`).map((c) => c.value);
    try { await DB.setTeacherClasses(teacherId, checked); toast("Classes updated."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
  }));
}

function adminClassesHTML() {
  const hasNursery = DB.classes.some((c) => c.id === "nursery");
  const setupNote = !hasNursery
    ? `<div class="panel"><div class="panel-body"><p style="margin-bottom:.8rem;">Set up the standard class list — Nursery, LKG, UKG, and Class 1 through Class 12 — so they're ready to pick from everywhere in the app.</p><button class="btn gold" id="setup-classes-btn">Set Up Standard Classes</button></div></div>`
    : "";
  const alumniCount = DB.students.filter((s) => s.classId === "alumni").length;
  const promoteNote = `<div class="panel"><div class="panel-body">
    <p style="margin-bottom:.4rem;"><strong>New academic year?</strong> This moves every student up one class — Nursery→LKG, LKG→UKG, … Class 11→Class 12. Class 12 students become Alumni (they leave the regular class lists but their records are kept).</p>
    <p class="field-hint" style="margin:.2rem 0 .8rem;">This affects every class at once and can't be undone automatically — double-check attendance, marks, and fees are wrapped up for the year before running it.${alumniCount ? ` Currently ${alumniCount} student(s) marked Alumni.` : ""}</p>
    <button class="btn gold" id="promote-btn">Promote All Students to Next Class</button>
  </div></div>`;
  const teacherOptions = (selectedId) => `<option value="">— unassigned —</option>` + DB.teachers.map((t) => `<option value="${t.id}" ${t.id===selectedId?"selected":""}>${esc(t.name)}</option>`).join("");
  const rows = DB.classesSorted().map((c) => `
    <tr data-class-row="${c.id}">
      <td>${esc(DB.classLabel(c.id))}</td>
      <td><select class="ct-select" data-class-teacher="${c.id}" style="margin:0;">${teacherOptions(c.classTeacherId)}</select></td>
      <td>${DB.studentsInClass(c.id).length}</td>
      <td class="wrap"><input type="text" class="subj-input" data-subjects="${c.id}" value="${esc((c.subjects || []).join(", "))}" placeholder="e.g. English, Maths, Science" style="margin:0;min-width:220px;"></td>
      <td style="white-space:nowrap;"><button class="btn sm outline" data-save-subjects="${c.id}">Save</button> <button class="btn sm danger" data-remove-class="${c.id}">Remove</button></td>
    </tr>`).join("");
  return `${setupNote}
  <div class="panel"><div class="panel-head"><h2>Classes &amp; sections</h2></div>
    <div class="panel-body" style="padding-bottom:0;"><p style="margin:0 0 .8rem;">Set each class's teacher and subject list here. Changing the class teacher dropdown saves right away; edit the subjects box and click Save.</p></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Class Teacher</th><th>Students</th><th>Subjects</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty">No classes yet.</td></tr>`}</tbody>
    </table></div></div>
  ${promoteNote}`;
}
function bindAdminClasses() {
  const setupBtn = $("#setup-classes-btn");
  if (setupBtn) setupBtn.addEventListener("click", async () => { setupBtn.disabled = true; setupBtn.textContent = "Setting up…"; await ensureStandardClasses(); toast("Standard classes are ready."); });
  $all("[data-remove-class]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Remove this class? Students already in it will keep their record but show an unknown class until reassigned.")) { await DB.removeClass(btn.dataset.removeClass); toast("Class removed."); }
  }));
  $all("[data-class-teacher]").forEach((sel) => sel.addEventListener("change", async () => {
    try { await DB.setClassTeacher(sel.dataset.classTeacher, sel.value || null); toast("Class teacher updated."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
  }));
  $all("[data-save-subjects]").forEach((btn) => btn.addEventListener("click", async () => {
    const classId = btn.dataset.saveSubjects;
    const input = $(`[data-subjects="${classId}"]`);
    const subjects = input.value.split(",").map((s) => s.trim()).filter(Boolean);
    btn.disabled = true;
    try { await DB.setClassSubjects(classId, subjects); toast("Subjects saved."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    btn.disabled = false;
  }));
  const promoteBtn = $("#promote-btn");
  if (promoteBtn) promoteBtn.addEventListener("click", async () => {
    if (!confirm("Promote EVERY student to the next class for the new academic year? Class 12 students will be marked Alumni. This can't be undone automatically.")) return;
    if (!confirm("Just to be sure — this changes the class of every student in the school right now. Continue?")) return;
    promoteBtn.disabled = true; promoteBtn.textContent = "Promoting…";
    try { const count = await DB.promoteAllStudents(); toast(`Promoted ${count} student(s) to their next class.`); }
    catch (err) { toast("Couldn't promote — " + friendlyAuthError(err)); }
    promoteBtn.disabled = false; promoteBtn.textContent = "Promote All Students to Next Class";
  });
}

function adminAttendanceHTML() {
  const classRows = DB.classesSorted().map((c) => {
    const students = DB.studentsInClass(c.id);
    const pcts = students.map((s) => DB.attendancePct(s.id)).filter((p) => p !== null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    return `<tr><td>${esc(DB.classLabel(c.id))}</td><td>${students.length}</td><td>${avg===null?"—":avg+"%"}</td><td><div class="progress-bar"><span style="width:${avg||0}%"></span></div></td></tr>`;
  }).join("");

  const classOptions = `<option value="">All classes</option>` + DB.classesSorted().map((c) => `<option value="${c.id}" ${App.attFilter.classId===c.id?"selected":""}>${esc(DB.classLabel(c.id))}</option>`).join("");

  return `<div class="panel"><div class="panel-head"><h2>Attendance by class</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Students</th><th>Avg. attendance</th><th style="width:160px;">Trend</th></tr></thead><tbody>${classRows || `<tr><td colspan="4" class="empty">No data yet.</td></tr>`}</tbody></table></div></div>
  <div class="panel">
    <div class="panel-head"><h2>Find a student</h2>
      <div class="pill-filter"><select id="att-filter-class">${classOptions}</select><input type="text" id="att-filter-q" placeholder="Search by name…" value="${esc(App.attFilter.q)}" style="width:200px;"></div>
    </div>
    <div class="table-wrap" id="att-filter-results"></div>
  </div>`;
}
function renderAttFilterResults() {
  const q = App.attFilter.q.trim().toLowerCase();
  const rows = DB.students
    .filter((s) => !App.attFilter.classId || s.classId === App.attFilter.classId)
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `<tr><td>${esc(s.name)}</td><td>${DB.classLabel(s.classId)}</td><td>${s.roll}</td><td>${DB.attendancePct(s.id) ?? "—"}%</td></tr>`)
    .join("");
  $("#att-filter-results").innerHTML = `<table><thead><tr><th>Name</th><th>Class</th><th>Roll</th><th>Attendance</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="empty">No matching students.</td></tr>`}</tbody></table>`;
}
function bindAdminAttendance() {
  renderAttFilterResults();
  $("#att-filter-class").addEventListener("change", (e) => { App.attFilter.classId = e.target.value; renderAttFilterResults(); });
  $("#att-filter-q").addEventListener("input", (e) => { App.attFilter.q = e.target.value; renderAttFilterResults(); });
}

function adminFeesHTML() {
  const collected = DB.fees.filter((f) => f.status === "paid").reduce((s, f) => s + f.amount, 0);
  const pending = DB.fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.amount, 0);
  const classOptions = `<option value="">All classes</option>` + DB.classesSorted().map((c) => `<option value="${c.id}" ${App.feesFilter.classId===c.id?"selected":""}>${esc(DB.classLabel(c.id))}</option>`).join("");

  const structureRows = DB.classesSorted().map((c) => {
    const rule = DB.feeRuleFor(c.id);
    return `<tr data-fee-rule-row="${c.id}">
      <td>${esc(DB.classLabel(c.id))}</td>
      <td><input type="text" class="fr-term" data-fr-term="${c.id}" value="${esc(rule?.term || "")}" placeholder="e.g. Term 2 (2026-27)" style="margin:0;min-width:170px;"></td>
      <td><input type="number" class="fr-amount" data-fr-amount="${c.id}" value="${rule?.amount ?? ""}" placeholder="Amount" style="margin:0;width:110px;"></td>
      <td><input type="date" class="fr-due" data-fr-due="${c.id}" value="${rule?.dueDate || ""}" style="margin:0;"></td>
      <td style="white-space:nowrap;">
        <button class="btn sm outline" data-save-rule="${c.id}">Save</button>
        <button class="btn sm gold" data-apply-rule="${c.id}" ${rule ? "" : "disabled"}>Apply to ${DB.studentsInClass(c.id).length} students</button>
      </td>
    </tr>`;
  }).join("");

  return `<div class="stat-grid">
    <div class="stat-card accent-green"><div class="label">Collected</div><div class="value">&#8377;${collected.toLocaleString("en-IN")}</div></div>
    <div class="stat-card accent-red"><div class="label">Outstanding</div><div class="value">&#8377;${pending.toLocaleString("en-IN")}</div></div>
    <div class="stat-card accent-navy"><div class="label">Records</div><div class="value">${DB.fees.length}</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Class fee structure</h2></div>
    <div class="panel-body" style="padding-bottom:0;"><p style="margin:0 0 .6rem;">Set how much each class should pay this term, then click <strong>Apply</strong> to create or update that fee for every student in the class (existing paid records keep their paid status).</p></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Term</th><th>Amount</th><th>Due date</th><th></th></tr></thead>
      <tbody>${structureRows || `<tr><td colspan="5" class="empty">No classes yet — set these up on the Classes tab.</td></tr>`}</tbody></table></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Fee records</h2>
      <div class="pill-filter"><select id="fee-filter-class">${classOptions}</select><input type="text" id="fee-filter-q" placeholder="Search by name…" value="${esc(App.feesFilter.q)}" style="width:200px;"></div>
    </div>
    <div class="table-wrap" id="fee-filter-results"></div>
  </div>`;
}
function renderFeeFilterResults() {
  const q = App.feesFilter.q.trim().toLowerCase();
  const rows = DB.fees
    .map((f) => ({ f, s: DB.studentById(f.studentId) }))
    .filter(({ s }) => !App.feesFilter.classId || s?.classId === App.feesFilter.classId)
    .filter(({ s }) => !q || (s?.name || "").toLowerCase().includes(q))
    .sort((a, b) => (a.s?.name || "").localeCompare(b.s?.name || ""))
    .map(({ f, s }) => `<tr><td>${esc(s?.name || "—")}</td><td>${DB.classLabel(s?.classId)}</td><td>${esc(f.term)}</td><td>&#8377;${f.amount.toLocaleString("en-IN")}</td><td>${fmtDate(f.dueDate)}</td><td>${feeBadge(f.status)}</td><td>${f.status !== "paid" ? `<button class="btn sm outline" data-mark-paid="${f.id}">Mark Paid</button>` : "—"}</td></tr>`)
    .join("");
  $("#fee-filter-results").innerHTML = `<table><thead><tr><th>Student</th><th>Class</th><th>Term</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="empty">No matching fee records.</td></tr>`}</tbody></table>`;
  $all("[data-mark-paid]", $("#fee-filter-results")).forEach((btn) => btn.addEventListener("click", async () => { await DB.markFeePaid(btn.dataset.markPaid); toast("Marked as paid."); }));
}
function bindAdminFees() {
  renderFeeFilterResults();
  $("#fee-filter-class").addEventListener("change", (e) => { App.feesFilter.classId = e.target.value; renderFeeFilterResults(); });
  $("#fee-filter-q").addEventListener("input", (e) => { App.feesFilter.q = e.target.value; renderFeeFilterResults(); });

  $all("[data-save-rule]").forEach((btn) => btn.addEventListener("click", async () => {
    const classId = btn.dataset.saveRule;
    const term = $(`[data-fr-term="${classId}"]`).value.trim();
    const amount = $(`[data-fr-amount="${classId}"]`).value;
    const due = $(`[data-fr-due="${classId}"]`).value;
    if (!term || !amount) { toast("Enter both a term and an amount."); return; }
    btn.disabled = true;
    try { await DB.setClassFeeRule(classId, term, amount, due); toast("Fee structure saved."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    btn.disabled = false;
  }));
  $all("[data-apply-rule]").forEach((btn) => btn.addEventListener("click", async () => {
    const classId = btn.dataset.applyRule;
    if (!confirm(`Apply this fee to every student in ${DB.classLabel(classId)}? This updates their fee records for that term.`)) return;
    btn.disabled = true;
    try { const count = await DB.applyClassFeeRule(classId); toast(`Fee applied to ${count} student(s).`); }
    catch (err) { toast("Couldn't apply — " + friendlyAuthError(err)); }
    btn.disabled = false;
  }));
}

function adminAnnouncementsHTML() {
  const sorted = [...DB.announcements].sort((a, b) => (a.date < b.date ? 1 : -1));
  const editing = App.annEditId ? DB.announcements.find((a) => a.id === App.annEditId) : null;
  const audienceOptions = (val) => `<option value="all" ${val==="all"?"selected":""}>Everyone</option><option value="parents" ${val==="parents"?"selected":""}>Parents only</option><option value="teachers" ${val==="teachers"?"selected":""}>Teachers only</option>`;
  const rows = sorted.map((a) => `
    <div class="panel-body" style="border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
        <div style="font-weight:600;">${esc(a.title)}</div>
        <span class="badge navy">${esc(a.audience)}</span>
      </div>
      <p style="margin:.4rem 0;">${esc(a.body)}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
        <div style="font-size:.75rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div>
        <div><button class="btn sm outline" data-edit-ann="${a.id}">Edit</button> <button class="btn sm danger" data-delete-ann="${a.id}">Delete</button></div>
      </div>
    </div>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>${editing ? "Edit announcement" : "Post an announcement"}</h2></div>
    <div class="panel-body"><form id="add-ann-form">
      <label>Title</label><input type="text" id="an-title" required value="${editing ? esc(editing.title) : ""}">
      <label>Message</label><textarea id="an-body" required>${editing ? esc(editing.body) : ""}</textarea>
      <label>Audience</label><select id="an-audience">${audienceOptions(editing ? editing.audience : "all")}</select>
      <button class="btn gold" type="submit" style="margin-top:.4rem;">${editing ? "Update Announcement" : "Post Announcement"}</button>
      ${editing ? `<button type="button" class="btn outline" id="ann-cancel-edit" style="margin-top:.4rem;margin-left:.5rem;">Cancel</button>` : ""}
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>All announcements</h2></div>${rows || `<div class="empty">Nothing posted yet.</div>`}</div>`;
}
function bindAdminAnnouncements() {
  $("#add-ann-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      if (App.annEditId) {
        await DB.updateAnnouncement(App.annEditId, { title: $("#an-title").value.trim(), body: $("#an-body").value.trim(), audience: $("#an-audience").value });
        toast("Announcement updated.");
        App.annEditId = null;
      } else {
        await DB.addAnnouncement($("#an-title").value.trim(), $("#an-body").value.trim(), $("#an-audience").value, DB.admin.name);
        toast("Announcement posted.");
      }
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-edit-ann]").forEach((btn) => btn.addEventListener("click", () => { App.annEditId = btn.dataset.editAnn; renderAdminView("announcements"); window.scrollTo(0, 0); }));
  $all("[data-delete-ann]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await DB.removeAnnouncement(btn.dataset.deleteAnn);
      if (App.annEditId === btn.dataset.deleteAnn) App.annEditId = null;
      toast("Announcement deleted.");
    } catch (err) { toast("Couldn't delete — " + friendlyAuthError(err)); }
  }));
  const cancelBtn = $("#ann-cancel-edit");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { App.annEditId = null; renderAdminView("announcements"); });
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
  else if (view === "announcements") { c.innerHTML = teacherAnnouncementsHTML(t); bindTeacherAnnouncements(t); }
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
      <tbody>${classes.map((c) => `<tr><td>${esc(DB.classLabel(c.id))}</td><td>${esc(t.subject)}</td><td>${DB.studentsInClass(c.id).length}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">No classes assigned.</td></tr>`}</tbody>
    </table></div></div>`;
}

function teacherAttendanceHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
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
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
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
  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  const list = [...DB.homework.filter((h) => classes.some((c) => c.id === h.classId))].sort(sortByPostedRecentFirst);
  const editing = App.hwEditId ? DB.homework.find((h) => h.id === App.hwEditId) : null;
  return `<div class="panel"><div class="panel-head"><h2>${editing ? "Edit homework" : "Assign homework"}</h2></div>
    <div class="panel-body"><form id="hw-form">
      <div class="form-row"><div><label>Class</label><select id="hw-class">${classOptions}</select></div><div><label>Due date</label><input type="date" id="hw-due" value="${editing ? editing.dueDate : DB.isoDaysAgo(-3)}"></div></div>
      <label>Details</label><textarea id="hw-desc" required>${editing ? esc(editing.description) : ""}</textarea>
      <button class="btn gold" type="submit">${editing ? "Update Homework" : "Post Homework"}</button>
      ${editing ? `<button type="button" class="btn outline" id="hw-cancel-edit" style="margin-left:.5rem;">Cancel</button>` : ""}
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>Posted homework</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Details</th><th>Posted</th><th>Due</th><th></th></tr></thead>
      <tbody>${list.map((h) => `<tr><td>${DB.classLabel(h.classId)}</td><td>${esc(h.subject)}</td><td class="wrap">${esc(h.description)}</td><td>${fmtDate(h.postedDate)}</td><td>${fmtDate(h.dueDate)}</td><td style="white-space:nowrap;"><button class="btn sm outline" data-edit-hw="${h.id}">Edit</button> <button class="btn sm danger" data-delete-hw="${h.id}">Delete</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing posted yet.</td></tr>`}</tbody>
    </table></div></div>`;
}
function bindTeacherHomework(t) {
  if (editingSelectDefault()) $("#hw-class").value = editingSelectDefault();
  $("#hw-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      if (App.hwEditId) {
        await DB.updateHomework(App.hwEditId, { classId: $("#hw-class").value, description: $("#hw-desc").value.trim(), dueDate: $("#hw-due").value });
        toast("Homework updated.");
        App.hwEditId = null;
      } else {
        await DB.addHomework($("#hw-class").value, t.subject, $("#hw-desc").value.trim(), $("#hw-due").value, t.id);
        toast("Homework posted.");
      }
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-edit-hw]").forEach((btn) => btn.addEventListener("click", () => { App.hwEditId = btn.dataset.editHw; renderTeacherView("homework"); window.scrollTo(0, 0); }));
  $all("[data-delete-hw]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this homework? Students and parents will no longer see it.")) return;
    try {
      await DB.removeHomework(btn.dataset.deleteHw);
      if (App.hwEditId === btn.dataset.deleteHw) App.hwEditId = null;
      toast("Homework deleted.");
    } catch (err) { toast("Couldn't delete — " + friendlyAuthError(err)); }
  }));
  const cancelBtn = $("#hw-cancel-edit");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { App.hwEditId = null; renderTeacherView("homework"); });
  function editingSelectDefault() {
    const editing = App.hwEditId ? DB.homework.find((h) => h.id === App.hwEditId) : null;
    return editing ? editing.classId : null;
  }
}

function teacherAnnouncementsHTML(t) {
  const sorted = [...DB.announcements].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = sorted.map((a) => `<div class="panel-body" style="border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div style="font-weight:600;">${esc(a.title)}</div><span class="badge navy">${esc(a.audience)}</span></div><p style="margin:.4rem 0;">${esc(a.body)}</p><div style="font-size:.75rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Post an announcement</h2></div>
    <div class="panel-body"><form id="t-add-ann-form">
      <label>Title</label><input type="text" id="t-an-title" required>
      <label>Message</label><textarea id="t-an-body" required></textarea>
      <label>Audience</label><select id="t-an-audience"><option value="all">Everyone</option><option value="parents">Parents only</option></select>
      <button class="btn gold" type="submit" style="margin-top:.4rem;">Post Announcement</button>
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>All announcements</h2></div>${rows || `<div class="empty">Nothing posted yet.</div>`}</div>`;
}
function bindTeacherAnnouncements(t) {
  $("#t-add-ann-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try { await DB.addAnnouncement($("#t-an-title").value.trim(), $("#t-an-body").value.trim(), $("#t-an-audience").value, t.name); toast("Announcement posted."); }
    catch (err) { toast("Couldn't post — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
}

function teacherStudentsHTML(t) {
  const classes = DB.classesForTeacher(t.id);
  return classes.map((c) => { const students = DB.studentsInClass(c.id); return `<div class="panel"><div class="panel-head"><h2>${esc(DB.classLabel(c.id))} (${students.length} students)</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Roll</th><th>Name</th><th>Attendance</th><th>Parent</th></tr></thead>
      <tbody>${students.map((s) => `<tr><td>${s.roll}</td><td>${esc(s.name)}</td><td>${DB.attendancePct(s.id) ?? "—"}%</td><td>${esc(DB.parentById(s.parentId)?.name || "Not linked")}</td></tr>`).join("")}</tbody></table></div></div>`; }).join("") || `<div class="empty">No classes assigned.</div>`;
}

/* =========================================================
   ADMIN — classroom tools (same as Teacher, but for any class)
   ========================================================= */
function adminTakeAttendanceHTML() {
  const classOptions = DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Mark attendance</h2>
    <div class="pill-filter"><select id="att-class">${classOptions || `<option value="">No classes yet</option>`}</select><input type="date" id="att-date" value="${DB.todayISO()}"></div></div>
    <div class="panel-body"><div class="att-list" id="att-list"></div><button class="btn gold" id="save-att" style="margin-top:1rem;">Save Attendance</button></div>
  </div>`;
}
function bindAdminTakeAttendance() {
  renderAttendanceList();
  $("#att-class").addEventListener("change", renderAttendanceList);
  $("#att-date").addEventListener("change", renderAttendanceList);
  $("#save-att").addEventListener("click", async (e) => {
    const classId = $("#att-class").value, date = $("#att-date").value;
    const entries = $all(".att-row", $("#att-list")).map((row) => ({ studentId: row.dataset.student, status: $(".att-toggle .on", row)?.dataset.status || "present" }));
    e.target.disabled = true;
    try { await DB.markAttendance(classId, date, entries, DB.admin.id); toast(`Attendance saved for ${DB.classLabel(classId)}.`); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    e.target.disabled = false;
  });
}

function adminMarksHTML() {
  const classOptions = DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Enter marks</h2>
    <div class="pill-filter"><select id="mk-class">${classOptions || `<option value="">No classes yet</option>`}</select><input type="text" id="mk-subject" placeholder="Subject" value="Mathematics" style="width:140px;"><input type="text" id="mk-exam" value="Term 2" style="width:140px;"><input type="number" id="mk-max" value="50" style="width:90px;"></div></div>
    <div class="panel-body"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Roll</th><th style="width:140px;">Marks</th></tr></thead><tbody id="mk-body"></tbody></table></div>
    <button class="btn gold" id="save-marks" style="margin-top:1rem;">Save Marks</button></div>
  </div>`;
}
function renderAdminMarksTable() {
  const classId = $("#mk-class").value, subject = $("#mk-subject").value.trim(), exam = $("#mk-exam").value.trim();
  const students = DB.studentsInClass(classId);
  $("#mk-body").innerHTML = students.map((s) => {
    const existing = DB.marks.find((m) => m.studentId === s.id && m.subject === subject && m.exam === exam);
    return `<tr data-student="${s.id}"><td>${esc(s.name)}</td><td>${s.roll}</td><td><input type="number" min="0" class="mk-input" value="${existing ? existing.marks : ""}" style="margin:0;"></td></tr>`;
  }).join("") || `<tr><td colspan="3" class="empty">No students in this class.</td></tr>`;
}
function bindAdminMarks() {
  renderAdminMarksTable();
  $("#mk-class").addEventListener("change", renderAdminMarksTable);
  $("#mk-subject").addEventListener("change", renderAdminMarksTable);
  $("#mk-exam").addEventListener("change", renderAdminMarksTable);
  $("#save-marks").addEventListener("click", async (e) => {
    const subject = $("#mk-subject").value.trim();
    const max = Number($("#mk-max").value) || 50, exam = $("#mk-exam").value.trim() || "Term";
    if (!subject) { toast("Enter a subject first."); return; }
    e.target.disabled = true;
    let count = 0;
    try {
      for (const row of $all("tr", $("#mk-body"))) {
        const input = row.querySelector(".mk-input");
        if (input && input.value !== "") { await DB.addMarks(row.dataset.student, subject, exam, Number(input.value), max); count++; }
      }
      toast(`Saved marks for ${count} student(s).`);
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    e.target.disabled = false;
  });
}

function adminHomeworkHTML() {
  const classOptions = DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  const list = [...DB.homework].sort(sortByPostedRecentFirst);
  const editing = App.hwEditId ? DB.homework.find((h) => h.id === App.hwEditId) : null;
  return `<div class="panel"><div class="panel-head"><h2>${editing ? "Edit homework" : "Assign homework"}</h2></div>
    <div class="panel-body"><form id="hw-form">
      <div class="form-row"><div><label>Class</label><select id="hw-class">${classOptions || `<option value="">No classes yet</option>`}</select></div><div><label>Subject</label><input type="text" id="hw-subject" required value="${editing ? esc(editing.subject) : ""}"></div></div>
      <label>Due date</label><input type="date" id="hw-due" value="${editing ? editing.dueDate : DB.isoDaysAgo(-3)}">
      <label>Details</label><textarea id="hw-desc" required>${editing ? esc(editing.description) : ""}</textarea>
      <button class="btn gold" type="submit">${editing ? "Update Homework" : "Post Homework"}</button>
      ${editing ? `<button type="button" class="btn outline" id="hw-cancel-edit" style="margin-left:.5rem;">Cancel</button>` : ""}
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>All posted homework</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Details</th><th>Posted</th><th>Due</th><th></th></tr></thead>
      <tbody>${list.map((h) => `<tr><td>${DB.classLabel(h.classId)}</td><td>${esc(h.subject)}</td><td class="wrap">${esc(h.description)}</td><td>${fmtDate(h.postedDate)}</td><td>${fmtDate(h.dueDate)}</td><td style="white-space:nowrap;"><button class="btn sm outline" data-edit-hw="${h.id}">Edit</button> <button class="btn sm danger" data-delete-hw="${h.id}">Delete</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing posted yet.</td></tr>`}</tbody>
    </table></div></div>`;
}
function bindAdminHomework() {
  const editing = App.hwEditId ? DB.homework.find((h) => h.id === App.hwEditId) : null;
  if (editing) { $("#hw-class").value = editing.classId; }
  $("#hw-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      if (App.hwEditId) {
        await DB.updateHomework(App.hwEditId, { classId: $("#hw-class").value, description: $("#hw-desc").value.trim(), dueDate: $("#hw-due").value });
        toast("Homework updated.");
        App.hwEditId = null;
      } else {
        await DB.addHomework($("#hw-class").value, $("#hw-subject").value.trim(), $("#hw-desc").value.trim(), $("#hw-due").value, DB.admin.id);
        toast("Homework posted.");
      }
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-edit-hw]").forEach((btn) => btn.addEventListener("click", () => { App.hwEditId = btn.dataset.editHw; renderAdminView("homework"); window.scrollTo(0, 0); }));
  $all("[data-delete-hw]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this homework?")) return;
    try {
      await DB.removeHomework(btn.dataset.deleteHw);
      if (App.hwEditId === btn.dataset.deleteHw) App.hwEditId = null;
      toast("Homework deleted.");
    } catch (err) { toast("Couldn't delete — " + friendlyAuthError(err)); }
  }));
  const cancelBtn = $("#hw-cancel-edit");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { App.hwEditId = null; renderAdminView("homework"); });
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
}

function parentDashboardHTML(child) {
  const att = DB.attendancePct(child.id);
  const fees = DB.feesFor(child.id);
  const due = fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.amount, 0);
  const hw = [...DB.homeworkForClass(child.classId)].sort(sortByPostedRecentFirst).slice(0, 3);
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
  return `<div class="panel"><div class="panel-head"><h2>Fee records</h2></div><div class="table-wrap"><table><thead><tr><th>Term</th><th>Amount</th><th>Due date</th><th>Status</th></tr></thead>
    <tbody>${rows.map((f) => `<tr><td>${esc(f.term)}</td><td>&#8377;${f.amount.toLocaleString("en-IN")}</td><td>${fmtDate(f.dueDate)}</td><td>${feeBadge(f.status)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No fee records.</td></tr>`}</tbody></table></div></div>
  <div class="panel"><div class="panel-head"><h2>Note</h2></div><div class="panel-body"><p>Fee payments are recorded by the school office once received. For payment queries, please contact the admin office directly.</p></div></div>`;
}
function parentHomeworkHTML(child) {
  const rows = [...DB.homeworkForClass(child.classId)].sort(sortByPostedRecentFirst);
  return `<div class="panel"><div class="panel-head"><h2>Homework for ${DB.classLabel(child.classId)}</h2></div>
    <div class="panel-body">${rows.map((h) => `<div style="margin-bottom:1.1rem;padding-bottom:1.1rem;border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;"><strong>${esc(h.subject)}</strong><span style="font-size:.78rem;color:var(--ink-soft);">Due ${fmtDate(h.dueDate)}</span></div><p style="margin:.3rem 0 0;">${esc(h.description)}</p><div style="font-size:.72rem;color:var(--ink-soft);margin-top:.2rem;">Posted ${fmtDate(h.postedDate)}</div></div>`).join("") || `<div class="empty">No homework posted.</div>`}</div></div>`;
}

function renderAnnouncementsList(list) {
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<div class="panel"><div class="panel-head"><h2>Announcements</h2></div>
    ${sorted.map((a) => `<div class="panel-body" style="border-bottom:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div style="font-weight:600;">${esc(a.title)}</div><span class="badge navy">${esc(a.audience)}</span></div><p style="margin:.4rem 0;">${esc(a.body)}</p><div style="font-size:.75rem;color:var(--ink-soft);">${fmtDate(a.date)} · ${esc(a.postedBy)}</div></div>`).join("") || `<div class="empty">No announcements yet.</div>`}
  </div>`;
}

/* =========================================================
   RECEPTION PORTAL
   ========================================================= */
function currentReceptionist() { return DB.receptionistById(App.userId); }
const enquiryStatusLabel = { new: "New", followup: "Follow-up", converted: "Converted", closed: "Closed" };
const enquiryStatusBadge = { new: "navy", followup: "gold", converted: "green", closed: "red" };

function renderReceptionView(view) {
  const r = currentReceptionist();
  if (!r) { $("#reception-content").innerHTML = `<div class="empty">Your reception account wasn't found. Ask the admin office to check your account.</div>`; return; }
  const titles = {
    dashboard: ["Dashboard", "Front desk overview"], search: ["Search", "Find a student, parent, or enquiry"],
    students: ["Student Records", "Look up student and parent details"], admissions: ["Admissions / Enquiry", "New enquiries and admission follow-ups"],
    visitors: ["Visitor Management", "Check visitors in and out"], fees: ["Fees & Gatepass", "View fee status and print gate passes"],
    communication: ["Communication", "Message parents and view announcements"], reports: ["Reports", "Daily activity at a glance"],
  };
  $("#reception-title").textContent = titles[view][0];
  $("#reception-subtitle").textContent = titles[view][1];
  const c = $("#reception-content");
  if (view === "dashboard") c.innerHTML = receptionDashboardHTML();
  else if (view === "search") { c.innerHTML = receptionSearchHTML(); bindReceptionSearch(); }
  else if (view === "students") { c.innerHTML = receptionStudentsHTML(); bindReceptionStudents(); }
  else if (view === "admissions") { c.innerHTML = receptionAdmissionsHTML(); bindReceptionAdmissions(); }
  else if (view === "visitors") { c.innerHTML = receptionVisitorsHTML(); bindReceptionVisitors(); }
  else if (view === "fees") { c.innerHTML = receptionFeesHTML(r); bindReceptionFees(r); }
  else if (view === "communication") { c.innerHTML = receptionCommunicationHTML(); bindReceptionCommunication(r); }
  else if (view === "reports") c.innerHTML = receptionReportsHTML();
}

function receptionDashboardHTML() {
  const todaysVisitors = DB.visitorsToday();
  const inBuilding = todaysVisitors.filter((v) => !v.checkOutTime).length;
  const openEnquiries = DB.enquiries.filter((e) => e.status === "new" || e.status === "followup").length;
  const pendingFees = DB.fees.filter((f) => f.status !== "paid").length;
  const recentEnquiries = [...DB.enquiries].sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1)).slice(0, 5);

  return `<div class="stat-grid">
    <div class="stat-card accent-navy"><div class="label">Visitors Today</div><div class="value">${todaysVisitors.length}</div><div class="delta">${inBuilding} currently in building</div></div>
    <div class="stat-card accent-gold"><div class="label">Open Enquiries</div><div class="value">${openEnquiries}</div><div class="delta">new + follow-up</div></div>
    <div class="stat-card accent-red"><div class="label">Fee Records Pending</div><div class="value">${pendingFees}</div><div class="delta">view-only from here</div></div>
    <div class="stat-card accent-green"><div class="label">Total Students</div><div class="value">${DB.students.length}</div><div class="delta">across ${DB.classes.length} classes</div></div>
  </div>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h2>Today's visitors</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>To meet</th><th>In</th><th>Out</th></tr></thead>
        <tbody>${todaysVisitors.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.personToMeet)}</td><td>${esc(v.checkInTime)}</td><td>${v.checkOutTime ? esc(v.checkOutTime) : `<span class="visitor-in">In building</span>`}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No visitors yet today.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Recent enquiries</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Class</th><th>Status</th></tr></thead>
        <tbody>${recentEnquiries.map((e) => `<tr><td>${esc(e.name)}</td><td>${DB.classLabel(e.classInterested)}</td><td><span class="badge ${enquiryStatusBadge[e.status]}">${enquiryStatusLabel[e.status]}</span></td></tr>`).join("") || `<tr><td colspan="3" class="empty">No enquiries yet.</td></tr>`}</tbody>
      </table></div>
    </div>
  </div>`;
}

function receptionSearchHTML() {
  return `<div class="panel"><div class="panel-head"><h2>Find a record</h2></div>
    <div class="panel-body">
      <div class="search-box"><input type="text" id="global-search-q" placeholder="Student name, admission no., mobile number, or enquiry ID…" value="${esc(App.searchQuery)}"><button class="btn gold" id="global-search-btn">Search</button></div>
      <div id="global-search-results" style="margin-top:1.2rem;"></div>
    </div>
  </div>`;
}
function runGlobalSearch() {
  const q = App.searchQuery;
  const results = $("#global-search-results");
  if (!q.trim()) { results.innerHTML = ""; return; }
  const { students, parents, enquiries } = DB.globalSearch(q);
  let html = "";
  if (students.length) {
    html += `<div class="result-group-label">Students</div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Admission No.</th><th>Class</th><th>Roll</th><th>Parent</th></tr></thead>
      <tbody>${students.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.admissionNo || "—")}</td><td>${DB.classLabel(s.classId)}</td><td>${s.roll}</td><td>${esc(DB.parentById(s.parentId)?.name || "Not linked")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if (parents.length) {
    html += `<div class="result-group-label">Parents</div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Children</th></tr></thead>
      <tbody>${parents.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.phone || "—")}</td><td>${DB.childrenOf(p.id).map((c) => esc(c.name)).join(", ") || "—"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if (enquiries.length) {
    html += `<div class="result-group-label">Enquiries</div><div class="table-wrap"><table><thead><tr><th>Enquiry ID</th><th>Name</th><th>Phone</th><th>Status</th></tr></thead>
      <tbody>${enquiries.map((e) => `<tr><td>${esc(e.id)}</td><td>${esc(e.name)}</td><td>${esc(e.phone)}</td><td><span class="badge ${enquiryStatusBadge[e.status]}">${enquiryStatusLabel[e.status]}</span></td></tr>`).join("")}</tbody></table></div>`;
  }
  results.innerHTML = html || `<div class="empty">No matching records.</div>`;
}
function bindReceptionSearch() {
  runGlobalSearch();
  $("#global-search-btn").addEventListener("click", () => { App.searchQuery = $("#global-search-q").value; runGlobalSearch(); });
  $("#global-search-q").addEventListener("keydown", (e) => { if (e.key === "Enter") { App.searchQuery = $("#global-search-q").value; runGlobalSearch(); } });
}

function receptionStudentsHTML() {
  const classOptions = `<option value="">All classes</option>` + DB.classesSorted().map((c) => `<option value="${c.id}" ${App.attFilter.classId===c.id?"selected":""}>${esc(DB.classLabel(c.id))}</option>`).join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Student records</h2>
      <div class="pill-filter"><select id="rc-stu-class">${classOptions}</select><input type="text" id="rc-stu-q" placeholder="Search by name…" style="width:200px;"></div>
    </div>
    <div class="table-wrap" id="rc-stu-results"></div>
  </div>`;
}
function renderReceptionStudentResults() {
  const classId = $("#rc-stu-class").value;
  const q = $("#rc-stu-q").value.trim().toLowerCase();
  const rows = DB.students
    .filter((s) => !classId || s.classId === classId)
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => { const p = DB.parentById(s.parentId); return `<tr><td>${esc(s.name)}</td><td>${esc(s.admissionNo || "—")}</td><td>${DB.classLabel(s.classId)}</td><td>${s.roll}</td><td><span class="badge navy">${esc(s.admissionStatus || "Enrolled")}</span></td><td>${esc(p?.name || "Not linked")}</td><td>${esc(p?.phone || "—")}</td></tr>`; })
    .join("");
  $("#rc-stu-results").innerHTML = `<table><thead><tr><th>Name</th><th>Admission No.</th><th>Class</th><th>Roll</th><th>Status</th><th>Parent</th><th>Parent Phone</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="empty">No matching students.</td></tr>`}</tbody></table>`;
}
function bindReceptionStudents() {
  renderReceptionStudentResults();
  $("#rc-stu-class").addEventListener("change", renderReceptionStudentResults);
  $("#rc-stu-q").addEventListener("input", renderReceptionStudentResults);
}

function receptionAdmissionsHTML() {
  const classOptions = DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  const sorted = [...DB.enquiries].sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1));
  const docLabel = { birthCertificate: "Birth Certificate", transferCertificate: "Transfer Certificate", photos: "Photographs", idProof: "ID Proof" };
  const rows = sorted.map((e) => `
    <div class="panel-body" style="border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center;">
        <div><strong>${esc(e.name)}</strong> <span style="color:var(--ink-soft);font-size:.82rem;">· ${esc(e.phone)}${e.email ? " · " + esc(e.email) : ""}</span></div>
        <span class="badge ${enquiryStatusBadge[e.status]}">${enquiryStatusLabel[e.status]}</span>
      </div>
      <div style="font-size:.82rem;color:var(--ink-soft);margin:.3rem 0;">Interested in ${DB.classLabel(e.classInterested)}${e.source ? " · Source: " + esc(e.source) : ""} · Enquired ${fmtDate(e.createdDate)}</div>
      <div class="form-row" style="margin-top:.6rem;">
        <div><label>Status</label><select data-enq-status="${e.id}" style="margin:0;">
          <option value="new" ${e.status==="new"?"selected":""}>New</option>
          <option value="followup" ${e.status==="followup"?"selected":""}>Follow-up</option>
          <option value="converted" ${e.status==="converted"?"selected":""}>Converted</option>
          <option value="closed" ${e.status==="closed"?"selected":""}>Closed</option>
        </select></div>
        <div><label>Follow-up date</label><input type="date" data-enq-followup="${e.id}" value="${e.followUpDate || ""}" style="margin:0;"></div>
      </div>
      <label style="margin-top:.6rem;">Follow-up notes</label>
      <textarea data-enq-notes="${e.id}" style="min-height:50px;">${esc(e.followUpNotes || "")}</textarea>
      <label style="display:flex;align-items:center;gap:.4rem;font-weight:400;font-size:.82rem;margin:.4rem 0;">
        <input type="checkbox" data-enq-form="${e.id}" ${e.admissionFormReceived ? "checked" : ""} style="width:auto;margin:0;"> Admission form received
      </label>
      <div class="field-hint" style="margin-bottom:.3rem;">Documents received:</div>
      <div class="doc-checklist">${Object.keys(docLabel).map((k) => `<label><input type="checkbox" data-enq-doc="${e.id}" data-doc-key="${k}" ${e.documents?.[k] ? "checked" : ""}> ${docLabel[k]}</label>`).join("")}</div>
      <div style="margin-top:.7rem;"><button class="btn sm outline" data-enq-save="${e.id}">Save Changes</button> <button class="btn sm danger" data-enq-delete="${e.id}">Delete Enquiry</button></div>
    </div>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>New enquiry</h2></div>
    <div class="panel-body"><form id="enq-form">
      <div class="form-row"><div><label>Name</label><input type="text" id="enq-name" required></div><div><label>Phone</label><input type="text" id="enq-phone" required></div></div>
      <div class="form-row"><div><label>Email <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="email" id="enq-email"></div>
        <div><label>Class interested in</label><select id="enq-class">${classOptions}</select></div></div>
      <label>Source <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="enq-source" placeholder="e.g. Walk-in, Phone, Referral, Website">
      <button class="btn gold" type="submit">Add Enquiry</button>
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>All enquiries (${DB.enquiries.length})</h2></div>${rows || `<div class="empty">No enquiries yet.</div>`}</div>`;
}
function bindReceptionAdmissions() {
  $("#enq-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      await DB.addEnquiry($("#enq-name").value.trim(), $("#enq-phone").value.trim(), $("#enq-email").value.trim(), $("#enq-class").value, $("#enq-source").value.trim());
      toast("Enquiry added.");
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-enq-save]").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.dataset.enqSave;
    const status = $(`[data-enq-status="${id}"]`).value;
    const followUpDate = $(`[data-enq-followup="${id}"]`).value;
    const followUpNotes = $(`[data-enq-notes="${id}"]`).value.trim();
    const admissionFormReceived = $(`[data-enq-form="${id}"]`).checked;
    const documents = {};
    $all(`[data-enq-doc="${id}"]`).forEach((cb) => { documents[cb.dataset.docKey] = cb.checked; });
    btn.disabled = true;
    try { await DB.updateEnquiry(id, { status, followUpDate, followUpNotes, admissionFormReceived, documents }); toast("Enquiry updated."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    btn.disabled = false;
  }));
  $all("[data-enq-delete]").forEach((btn) => btn.addEventListener("click", async () => {
    if (confirm("Delete this enquiry?")) { await DB.removeEnquiry(btn.dataset.enqDelete); toast("Enquiry deleted."); }
  }));
}

function receptionVisitorsHTML() {
  const todays = [...DB.visitorsToday()].sort((a, b) => (a.checkInTime < b.checkInTime ? 1 : -1));
  return `<div class="panel"><div class="panel-head"><h2>New visitor entry</h2></div>
    <div class="panel-body"><form id="visitor-form">
      <div class="form-row"><div><label>Visitor name</label><input type="text" id="v-name" required></div><div><label>Phone <span style="font-weight:400;color:var(--ink-soft);">(optional)</span></label><input type="text" id="v-phone"></div></div>
      <div class="form-row"><div><label>Purpose of visit</label><input type="text" id="v-purpose" required placeholder="e.g. Meet class teacher, Admission enquiry"></div>
        <div><label>Student / staff to meet</label><input type="text" id="v-meet" required placeholder="e.g. Mrs. Kavita Sharma, or Aarav Malhotra (Class 6)"></div></div>
      <button class="btn gold" type="submit">Check In</button>
    </form></div></div>
  <div class="panel"><div class="panel-head"><h2>Today's visitors (${todays.length})</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Purpose</th><th>To meet</th><th>In</th><th>Out</th><th></th></tr></thead>
      <tbody>${todays.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.phone || "—")}</td><td class="wrap">${esc(v.purpose)}</td><td>${esc(v.personToMeet)}</td><td>${esc(v.checkInTime)}</td><td>${v.checkOutTime ? esc(v.checkOutTime) : `<span class="visitor-in">In building</span>`}</td><td>${v.checkOutTime ? "—" : `<button class="btn sm outline" data-checkout="${v.id}">Check Out</button>`}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No visitors yet today.</td></tr>`}</tbody>
    </table></div></div>`;
}
function bindReceptionVisitors() {
  $("#visitor-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      await DB.checkInVisitor($("#v-name").value.trim(), $("#v-phone").value.trim(), $("#v-purpose").value.trim(), $("#v-meet").value.trim());
      toast("Visitor checked in.");
    } catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $all("[data-checkout]").forEach((btn) => btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await DB.checkOutVisitor(btn.dataset.checkout); toast("Visitor checked out."); }
    catch (err) { toast("Couldn't save — " + friendlyAuthError(err)); }
  }));
}

function receptionFeesHTML(r) {
  const classOptions = `<option value="">All classes</option>` + DB.classesSorted().map((c) => `<option value="${c.id}">${esc(DB.classLabel(c.id))}</option>`).join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Fee status (view only)</h2>
      <div class="pill-filter"><select id="rc-fee-class">${classOptions}</select><input type="text" id="rc-fee-q" placeholder="Search by name…" style="width:200px;"></div>
    </div>
    <div class="table-wrap" id="rc-fee-results"></div>
  </div>
  ${gatepassSectionHTML()}`;
}
function renderReceptionFeeResults() {
  const classId = $("#rc-fee-class").value;
  const q = $("#rc-fee-q").value.trim().toLowerCase();
  const rows = DB.fees
    .map((f) => ({ f, s: DB.studentById(f.studentId) }))
    .filter(({ s }) => !classId || s?.classId === classId)
    .filter(({ s }) => !q || (s?.name || "").toLowerCase().includes(q))
    .sort((a, b) => (a.s?.name || "").localeCompare(b.s?.name || ""))
    .map(({ f, s }) => `<tr><td>${esc(s?.name || "—")}</td><td>${DB.classLabel(s?.classId)}</td><td>${esc(f.term)}</td><td>&#8377;${f.amount.toLocaleString("en-IN")}</td><td>${fmtDate(f.dueDate)}</td><td>${feeBadge(f.status)}</td></tr>`)
    .join("");
  $("#rc-fee-results").innerHTML = `<table><thead><tr><th>Student</th><th>Class</th><th>Term</th><th>Amount</th><th>Due date</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="empty">No matching fee records.</td></tr>`}</tbody></table>`;
}
function bindReceptionFees(r) {
  renderReceptionFeeResults();
  $("#rc-fee-class").addEventListener("change", renderReceptionFeeResults);
  $("#rc-fee-q").addEventListener("input", renderReceptionFeeResults);
  bindGatepassSection(r?.name || "Reception");
}

/* ---------- Gate pass: reusable in both Reception and Admin ---------- */
function gatepassSectionHTML() {
  const studentOptions = [...DB.students].sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.id}">${esc(s.name)} — ${DB.classLabel(s.classId)}</option>`).join("");
  const classOptions = `<option value="">All classes</option>` + DB.classesSorted().map((c) => `<option value="${c.id}" ${App.gatepassFilter.classId===c.id?"selected":""}>${esc(DB.classLabel(c.id))}</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Generate gate pass</h2></div>
    <div class="panel-body">
      <form id="gatepass-form">
        <label>Student</label><select id="gp-student" required><option value="">— select student —</option>${studentOptions}</select>
        <label>Reason</label><input type="text" id="gp-reason" required placeholder="e.g. Half-day leave, Medical appointment">
        <div class="form-row">
          <div><label>Picked up by</label><input type="text" id="gp-pickup-name" required placeholder="Name of person taking the student"></div>
          <div><label>Relation to student</label><input type="text" id="gp-pickup-relation" required placeholder="e.g. Mother, Father, Guardian, Driver"></div>
        </div>
        <button class="btn gold" type="submit">Generate Gate Pass</button>
      </form>
      <div id="gatepass-preview"></div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Gate pass records</h2>
      <div class="pill-filter">
        <select id="gp-filter-class">${classOptions}</select>
        <input type="text" id="gp-filter-q" placeholder="Search by name…" value="${esc(App.gatepassFilter.q)}" style="width:170px;">
        <input type="text" id="gp-filter-roll" placeholder="Roll no." value="${esc(App.gatepassFilter.roll)}" style="width:90px;">
        <input type="date" id="gp-filter-date" value="${App.gatepassFilter.date}">
      </div>
    </div>
    <div class="table-wrap" id="gp-records"></div>
  </div>`;
}
function renderGatepassRecords() {
  const { classId, q, roll, date } = App.gatepassFilter;
  const query = q.trim().toLowerCase();
  const rows = DB.gatepasses
    .map((g) => ({ g, s: DB.studentById(g.studentId) }))
    .filter(({ s }) => !classId || s?.classId === classId)
    .filter(({ s }) => !query || (s?.name || "").toLowerCase().includes(query))
    .filter(({ s }) => !roll || String(s?.roll ?? "").includes(roll))
    .filter(({ g }) => !date || g.date === date)
    .sort((a, b) => (a.g.date < b.g.date ? 1 : -1))
    .map(({ g, s }) => `<tr>
      <td>${esc(s?.name || "—")}</td><td>${DB.classLabel(s?.classId)}</td><td>${s?.roll ?? "—"}</td>
      <td class="wrap">${esc(g.reason)}</td><td>${esc(g.pickupName || "—")}</td><td>${esc(g.pickupRelation || "—")}</td>
      <td>${fmtDate(g.date)}</td><td>${esc(g.time)}</td><td>${esc(g.issuedBy)}</td>
      <td><button class="btn sm outline" data-print-gp="${g.id}">Print</button></td>
    </tr>`).join("");
  $("#gp-records").innerHTML = `<table><thead><tr><th>Student</th><th>Class</th><th>Roll</th><th>Reason</th><th>Picked up by</th><th>Relation</th><th>Date</th><th>Time</th><th>Issued by</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="10" class="empty">No matching gate passes.</td></tr>`}</tbody></table>`;
  $all("[data-print-gp]", $("#gp-records")).forEach((btn) => btn.addEventListener("click", () => {
    const g = DB.gatepassById(btn.dataset.printGp);
    if (g) { showGatepassPreview(g); window.print(); }
  }));
}
function showGatepassPreview(g) {
  const s = DB.studentById(g.studentId);
  $("#gatepass-preview").innerHTML = `
    <div class="gatepass-card print-only">
      <div class="gp-head"><div class="gp-title">New Horizon School — Gate Pass</div></div>
      <div class="gp-row"><span class="k">Student</span><span class="v">${esc(s?.name || "—")}</span></div>
      <div class="gp-row"><span class="k">Class</span><span class="v">${DB.classLabel(s?.classId)}</span></div>
      <div class="gp-row"><span class="k">Roll No.</span><span class="v">${s?.roll ?? "—"}</span></div>
      <div class="gp-row"><span class="k">Reason</span><span class="v">${esc(g.reason)}</span></div>
      <div class="gp-row"><span class="k">Picked up by</span><span class="v">${esc(g.pickupName || "—")}</span></div>
      <div class="gp-row"><span class="k">Relation</span><span class="v">${esc(g.pickupRelation || "—")}</span></div>
      <div class="gp-row"><span class="k">Date</span><span class="v">${fmtDate(g.date)}</span></div>
      <div class="gp-row"><span class="k">Time</span><span class="v">${esc(g.time)}</span></div>
      <div class="gp-row"><span class="k">Issued by</span><span class="v">${esc(g.issuedBy)}</span></div>
    </div>
    <div class="gatepass-card" style="border:none;padding-top:0;">
      <button class="btn gold" id="gp-print-btn" style="margin-top:.8rem;">Print Gate Pass</button>
    </div>`;
  $("#gp-print-btn").addEventListener("click", () => window.print());
}
function bindGatepassSection(actorName) {
  renderGatepassRecords();
  $("#gatepass-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      const studentId = $("#gp-student").value;
      const gp = await DB.addGatepass(studentId, $("#gp-reason").value.trim(), $("#gp-pickup-name").value.trim(), $("#gp-pickup-relation").value.trim(), actorName);
      showGatepassPreview(gp);
      toast("Gate pass generated.");
    } catch (err) { toast("Couldn't generate — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
  $("#gp-filter-class").addEventListener("change", (e) => { App.gatepassFilter.classId = e.target.value; renderGatepassRecords(); });
  $("#gp-filter-q").addEventListener("input", (e) => { App.gatepassFilter.q = e.target.value; renderGatepassRecords(); });
  $("#gp-filter-roll").addEventListener("input", (e) => { App.gatepassFilter.roll = e.target.value; renderGatepassRecords(); });
  $("#gp-filter-date").addEventListener("change", (e) => { App.gatepassFilter.date = e.target.value; renderGatepassRecords(); });
}

function receptionCommunicationHTML() {
  const parentOptions = [...DB.parents].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}">${esc(p.name)} (${DB.childrenOf(p.id).map((c) => c.name).join(", ") || "no child linked"})</option>`).join("");
  return `<div class="panel"><div class="panel-head"><h2>Message a parent</h2></div>
    <div class="panel-body"><form id="msg-form">
      <label>Parent</label><select id="msg-parent" required><option value="">— select parent —</option>${parentOptions}</select>
      <label>Title</label><input type="text" id="msg-title" required placeholder="e.g. Please collect fee receipt">
      <label>Message</label><textarea id="msg-body" required></textarea>
      <button class="btn gold" type="submit">Send</button>
    </form></div></div>
  ${renderAnnouncementsList(DB.announcements)}`;
}
function bindReceptionCommunication(r) {
  $("#msg-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setBusy(e.target, true);
    try {
      const parentId = $("#msg-parent").value;
      const child = DB.childrenOf(parentId)[0];
      await DB.sendParentMessage(parentId, child ? child.id : null, $("#msg-title").value.trim(), $("#msg-body").value.trim(), r?.name || "Reception");
      toast("Message sent.");
      e.target.reset();
    } catch (err) { toast("Couldn't send — " + friendlyAuthError(err)); }
    setBusy(e.target, false);
  });
}

function receptionReportsHTML() {
  const todaysVisitors = DB.visitorsToday();
  const byStatus = { new: 0, followup: 0, converted: 0, closed: 0 };
  DB.enquiries.forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
  const converted = [...DB.enquiries.filter((e) => e.status === "converted")].sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1));
  const upcoming = [...DB.enquiries.filter((e) => e.followUpDate)].sort((a, b) => (a.followUpDate > b.followUpDate ? 1 : -1));

  return `
  <div class="panel"><div class="panel-head"><h2>Daily visitors — ${fmtDate(DB.todayISO())}</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Purpose</th><th>To meet</th><th>In</th><th>Out</th></tr></thead>
      <tbody>${todaysVisitors.map((v) => `<tr><td>${esc(v.name)}</td><td class="wrap">${esc(v.purpose)}</td><td>${esc(v.personToMeet)}</td><td>${esc(v.checkInTime)}</td><td>${v.checkOutTime || "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No visitors today.</td></tr>`}</tbody>
    </table></div></div>
  <div class="panel"><div class="panel-head"><h2>Enquiries by status</h2></div>
    <div class="stat-grid" style="padding:1.2rem;">
      <div class="stat-card accent-navy"><div class="label">New</div><div class="value">${byStatus.new}</div></div>
      <div class="stat-card accent-gold"><div class="label">Follow-up</div><div class="value">${byStatus.followup}</div></div>
      <div class="stat-card accent-green"><div class="label">Converted</div><div class="value">${byStatus.converted}</div></div>
      <div class="stat-card accent-red"><div class="label">Closed</div><div class="value">${byStatus.closed}</div></div>
    </div></div>
  <div class="panel"><div class="panel-head"><h2>Admissions (converted enquiries)</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Class</th><th>Enquired</th></tr></thead>
      <tbody>${converted.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.phone)}</td><td>${DB.classLabel(e.classInterested)}</td><td>${fmtDate(e.createdDate)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No admissions yet.</td></tr>`}</tbody>
    </table></div></div>
  <div class="panel"><div class="panel-head"><h2>Appointments (follow-ups)</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Follow-up date</th><th>Status</th></tr></thead>
      <tbody>${upcoming.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.phone)}</td><td>${fmtDate(e.followUpDate)}</td><td><span class="badge ${enquiryStatusBadge[e.status]}">${enquiryStatusLabel[e.status]}</span></td></tr>`).join("") || `<tr><td colspan="4" class="empty">No follow-ups scheduled.</td></tr>`}</tbody>
    </table></div></div>`;
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
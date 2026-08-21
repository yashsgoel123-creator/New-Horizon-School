// =========================================================
// New Horizon School — ERP Data Layer (Firestore-backed)
// -----------------------------------------------------------
// Every read shown in the UI comes from these local arrays,
// which are kept live-synced with Firestore via onSnapshot
// listeners — so a change made on one device (e.g. a teacher
// marking attendance) appears on another device (a parent's
// phone) automatically, without a page refresh.
// =========================================================
import {
  db, auth, collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, getDocs, getDoc, query, where, writeBatch,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, createLoginAccount,
} from "./firebase-init.js";

// Standard Indian school class list, Nursery through Class 12.
// IDs are fixed slugs so ensureStandardClasses() is safe to call
// repeatedly (it just re-writes the same 15 documents).
export const STANDARD_CLASSES = [
  ["nursery", "Nursery"], ["lkg", "LKG"], ["ukg", "UKG"],
  ["class-1", "Class 1"], ["class-2", "Class 2"], ["class-3", "Class 3"],
  ["class-4", "Class 4"], ["class-5", "Class 5"], ["class-6", "Class 6"],
  ["class-7", "Class 7"], ["class-8", "Class 8"], ["class-9", "Class 9"],
  ["class-10", "Class 10"], ["class-11", "Class 11"], ["class-12", "Class 12"],
];

export async function ensureStandardClasses() {
  const batch = writeBatch(db);
  STANDARD_CLASSES.forEach(([id, label]) => {
    batch.set(doc(db, "classes", id), { name: label, section: "", classTeacherId: null, subjects: [] }, { merge: true });
  });
  await batch.commit();
}

export const DB = {
  classes: [], teachers: [], parents: [], students: [],
  attendance: [], marks: [], fees: [], announcements: [], homework: [], feeRules: [],
  admin: { id: "admin1", name: "Admin Office" },

  todayISO: () => new Date().toISOString().slice(0, 10),
  isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); },

  // ---- lookups (all read from the local, live-synced cache) ----
  classById(id) { return this.classes.find((c) => c.id === id); },
  classLabel(id) { const c = this.classById(id); if (!c) return "—"; return c.section ? `${c.name}-${c.section}` : c.name; },
  // sorted in natural school order (Nursery, LKG, UKG, Class 1..12), unknown/custom classes fall to the end alphabetically
  classesSorted() {
    const order = STANDARD_CLASSES.map(([id]) => id);
    return [...this.classes].sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  },
  teacherById(id) { return this.teachers.find((t) => t.id === id); },
  parentById(id) { return this.parents.find((p) => p.id === id); },
  studentById(id) { return this.students.find((s) => s.id === id); },
  studentsInClass(classId) { return this.students.filter((s) => s.classId === classId).sort((a, b) => a.roll - b.roll); },
  childrenOf(parentId) { return this.students.filter((s) => s.parentId === parentId); },
  classesForTeacher(teacherId) {
    const t = this.teacherById(teacherId);
    return this.classes.filter((c) => c.classTeacherId === teacherId || (t?.classIds || []).includes(c.id));
  },

  attendanceFor(studentId) { return this.attendance.filter((a) => a.studentId === studentId).sort((a, b) => (a.date < b.date ? 1 : -1)); },
  attendancePct(studentId) {
    const rows = this.attendanceFor(studentId);
    if (!rows.length) return null;
    const present = rows.filter((r) => r.status === "present").length;
    return Math.round((present / rows.length) * 100);
  },
  schoolAttendanceToday() {
    const today = this.todayISO();
    const rows = this.attendance.filter((a) => a.date === today);
    if (!rows.length) return null;
    const present = rows.filter((r) => r.status === "present").length;
    return Math.round((present / rows.length) * 100);
  },
  marksFor(studentId) { return this.marks.filter((m) => m.studentId === studentId); },
  feesFor(studentId) { return this.fees.filter((f) => f.studentId === studentId); },
  announcementsFor(audience) { return this.announcements.filter((a) => a.audience === "all" || a.audience === audience); },
  homeworkForClass(classId) { return this.homework.filter((h) => h.classId === classId); },

  // ---- writes: every one of these goes straight to Firestore.
  // The onSnapshot listeners set up in subscribeAll() pick the
  // change up automatically (on this device and every other one).

  // parentName is free text. If a parent with that exact name (case-
  // insensitive) already exists, the student links to them. Otherwise
  // a new parent record is created — and if parentEmail+parentPassword
  // were given, a real login is created for them too.
  async addStudent(name, classId, roll, parentName, parentEmail, parentPassword) {
    let parentId = null;
    const cleanName = (parentName || "").trim();
    if (cleanName) {
      const existing = this.parents.find((p) => p.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (existing) {
        parentId = existing.id;
      } else {
        const pRef = doc(collection(db, "parents"));
        await setDoc(pRef, { name: cleanName, phone: "", username: "" });
        parentId = pRef.id;
        if (parentEmail && parentPassword) {
          const uid = await createLoginAccount(parentEmail.trim(), parentPassword);
          await setDoc(doc(db, "users", uid), { role: "parent", refId: parentId, name: cleanName });
        }
      }
    }
    const ref = doc(collection(db, "students"));
    await setDoc(ref, { name, classId, roll: Number(roll), parentId, dob: "" });
  },
  async removeStudent(id) { await deleteDoc(doc(db, "students", id)); },

  async addTeacher(name, subject, phone, username, email, password) {
    const ref = doc(collection(db, "teachers"));
    await setDoc(ref, { name, subject, phone, username, classIds: [] });
    if (email && password) {
      const uid = await createLoginAccount(email.trim(), password);
      await setDoc(doc(db, "users", uid), { role: "teacher", refId: ref.id, name });
    }
    return ref.id;
  },
  async removeTeacher(id) { await deleteDoc(doc(db, "teachers", id)); },

  async removeClass(id) { await deleteDoc(doc(db, "classes", id)); },

  // ---- class ↔ teacher assignment ----
  async setClassTeacher(classId, teacherId) {
    await updateDoc(doc(db, "classes", classId), { classTeacherId: teacherId || null });
  },
  async setTeacherClasses(teacherId, classIds) {
    await updateDoc(doc(db, "teachers", teacherId), { classIds });
  },
  async setClassSubjects(classId, subjects) {
    await updateDoc(doc(db, "classes", classId), { subjects });
  },

  // ---- class-wise fee structure ----
  // One "rule" document per class: the standard fee for that class this
  // term. Apply it to every student in the class with applyClassFeeRule().
  feeRuleFor(classId) { return this.feeRules.find((r) => r.id === classId) || null; },
  async setClassFeeRule(classId, term, amount, dueDate) {
    await setDoc(doc(db, "feeRules", classId), { classId, term, amount: Number(amount), dueDate });
  },
  async applyClassFeeRule(classId) {
    const rule = this.feeRuleFor(classId);
    if (!rule) throw new Error("Set a fee amount for this class first.");
    const students = this.studentsInClass(classId);
    const batch = writeBatch(db);
    students.forEach((s) => {
      const existing = this.fees.find((f) => f.studentId === s.id && f.term === rule.term);
      const ref = existing ? doc(db, "fees", existing.id) : doc(collection(db, "fees"));
      batch.set(ref, { studentId: s.id, term: rule.term, amount: rule.amount, dueDate: rule.dueDate, status: existing ? existing.status : "pending" });
    });
    await batch.commit();
    return students.length;
  },

  async markAttendance(classId, date, entries, markedBy) {
    const batch = writeBatch(db);
    for (const { studentId, status } of entries) {
      const existing = this.attendance.find((a) => a.studentId === studentId && a.date === date);
      const ref = existing ? doc(db, "attendance", existing.id) : doc(collection(db, "attendance"));
      batch.set(ref, { date, studentId, classId, status, markedBy });
    }
    await batch.commit();
  },

  async addMarks(studentId, subject, exam, marks, max) {
    const existing = this.marks.find((m) => m.studentId === studentId && m.subject === subject && m.exam === exam);
    const ref = existing ? doc(db, "marks", existing.id) : doc(collection(db, "marks"));
    await setDoc(ref, { studentId, subject, exam, marks, max });
  },

  async markFeePaid(feeId) { await updateDoc(doc(db, "fees", feeId), { status: "paid" }); },

  async addAnnouncement(title, body, audience, postedBy) {
    const ref = doc(collection(db, "announcements"));
    await setDoc(ref, { title, body, audience, date: this.todayISO(), postedBy });
  },

  async addHomework(classId, subject, description, dueDate, postedBy) {
    const ref = doc(collection(db, "homework"));
    await setDoc(ref, { classId, subject, description, dueDate, postedBy });
  },
};

// ---------------------------------------------------------
// Live sync: mirrors each Firestore collection into DB.<name>
// ---------------------------------------------------------
const COLLECTIONS = ["classes", "teachers", "parents", "students", "attendance", "marks", "fees", "announcements", "homework", "feeRules"];

export function subscribeAll(onChange) {
  const unsubs = COLLECTIONS.map((name) =>
    onSnapshot(collection(db, name), (snap) => {
      DB[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onChange();
    })
  );
  return () => unsubs.forEach((u) => u());
}

// ---------------------------------------------------------
// Auth
// ---------------------------------------------------------
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, "users", cred.user.uid));
  if (!userDoc.exists()) throw new Error("No role assigned to this account. Ask the admin office to set one up.");
  return userDoc.data(); // { role: 'admin' | 'teacher' | 'parent', refId, name }
}
export async function logout() { await signOut(auth); }
export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }

// ---------------------------------------------------------
// One-time sample data seed — only writes if the "classes"
// collection is empty, so it's safe to leave this call in
// place permanently.
// ---------------------------------------------------------
export async function seedIfEmpty() {
  const existing = await getDocs(collection(db, "classes"));
  if (!existing.empty) return false;

  const batch = writeBatch(db);
  const set = (col, id, data) => batch.set(doc(db, col, id), data);

  STANDARD_CLASSES.forEach(([id, label]) => set("classes", id, { name: label, section: "", classTeacherId: null, subjects: [] }));
  set("classes", "class-6", { name: "Class 6", section: "", classTeacherId: "t1", subjects: ["English", "Mathematics", "Science", "Hindi", "Art", "Games"] });
  set("classes", "class-7", { name: "Class 7", section: "", classTeacherId: "t2", subjects: ["Mathematics", "English", "Social Science", "Science", "Computer", "Library"] });
  set("classes", "class-9", { name: "Class 9", section: "", classTeacherId: "t3", subjects: ["Science", "Mathematics", "English", "Social Science", "Sanskrit", "Games"] });
  set("classes", "class-11", { name: "Class 11", section: "", classTeacherId: "t4", subjects: ["Physics", "Chemistry", "Mathematics", "English", "Physical Ed.", "Physics Lab"] });

  set("teachers", "t1", { name: "Mrs. Kavita Sharma", subject: "English", phone: "9411000001", classIds: ["class-6"], username: "kavita.sharma" });
  set("teachers", "t2", { name: "Mr. Ramesh Yadav", subject: "Mathematics", phone: "9411000002", classIds: ["class-7"], username: "ramesh.yadav" });
  set("teachers", "t3", { name: "Ms. Priya Chauhan", subject: "Science", phone: "9411000003", classIds: ["class-9"], username: "priya.chauhan" });
  set("teachers", "t4", { name: "Mr. Arvind Tyagi", subject: "Physics", phone: "9411000004", classIds: ["class-11"], username: "arvind.tyagi" });

  set("parents", "p1", { name: "Ritu Malhotra", phone: "9822000001", username: "ritu.malhotra", childIds: ["s1"] });
  set("parents", "p2", { name: "Sanjeev Tyagi", phone: "9822000002", username: "sanjeev.tyagi", childIds: ["s2", "s3"] });
  set("parents", "p3", { name: "Anjali Chaudhary", phone: "9822000003", username: "anjali.chaudhary", childIds: ["s4"] });

  const students = [
    ["s1", "Aarav Malhotra", "class-6", 4, "p1"], ["s2", "Ishaan Tyagi", "class-7", 11, "p2"],
    ["s3", "Meher Tyagi", "class-6", 9, "p2"], ["s4", "Diya Chaudhary", "class-11", 2, "p3"],
    ["s5", "Kabir Singh", "class-6", 1, null], ["s6", "Anaya Verma", "class-6", 2, null],
    ["s7", "Vivaan Gupta", "class-7", 3, null], ["s8", "Sara Khan", "class-9", 5, null],
    ["s9", "Reyansh Rathi", "class-9", 6, null], ["s10", "Zara Ansari", "class-11", 7, null],
  ];
  students.forEach(([id, name, classId, roll, parentId]) => set("students", id, { name, classId, roll, parentId, dob: "" }));

  set("fees", "f1", { studentId: "s1", term: "Term 2 (2026-27)", amount: 18500, status: "paid", dueDate: "2026-07-15" });
  set("fees", "f2", { studentId: "s2", term: "Term 2 (2026-27)", amount: 19500, status: "pending", dueDate: "2026-09-05" });
  set("fees", "f3", { studentId: "s3", term: "Term 2 (2026-27)", amount: 18500, status: "pending", dueDate: "2026-09-05" });
  set("fees", "f4", { studentId: "s4", term: "Term 2 (2026-27)", amount: 24000, status: "overdue", dueDate: "2026-08-01" });
  set("fees", "f5", { studentId: "s5", term: "Term 2 (2026-27)", amount: 18500, status: "paid", dueDate: "2026-07-15" });

  set("feeRules", "class-6", { classId: "class-6", term: "Term 2 (2026-27)", amount: 18500, dueDate: "2026-09-05" });
  set("feeRules", "class-7", { classId: "class-7", term: "Term 2 (2026-27)", amount: 19500, dueDate: "2026-09-05" });
  set("feeRules", "class-11", { classId: "class-11", term: "Term 2 (2026-27)", amount: 24000, dueDate: "2026-09-05" });

  set("announcements", "an1", { title: "PTM — Term 2 Progress", body: "Parent-Teacher Meeting for all classes will be held on 5 September.", audience: "parents", date: DB.isoDaysAgo(2), postedBy: "Admin Office" });
  set("announcements", "an2", { title: "Sports Day Rehearsal", body: "March-past rehearsal for Classes VI–VIII during the last period.", audience: "all", date: DB.isoDaysAgo(1), postedBy: "Admin Office" });
  set("announcements", "an3", { title: "Staff Meeting — Thursday", body: "All subject teachers to submit Term 2 question papers by Wednesday.", audience: "teachers", date: DB.isoDaysAgo(4), postedBy: "Principal's Office" });

  set("homework", "h1", { classId: "class-6", subject: "English", description: "Read Chapter 4 and answer Q1–Q5.", dueDate: DB.isoDaysAgo(-2), postedBy: "t1" });
  set("homework", "h2", { classId: "class-7", subject: "Mathematics", description: "Exercise 7.2, all questions.", dueDate: DB.isoDaysAgo(-3), postedBy: "t2" });
  set("homework", "h3", { classId: "class-9", subject: "Science", description: "Diagram of the human digestive system.", dueDate: DB.isoDaysAgo(-1), postedBy: "t3" });

  await batch.commit();
  return true;
}
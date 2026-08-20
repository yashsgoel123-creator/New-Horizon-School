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
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "./firebase-init.js";

export const DB = {
  classes: [], teachers: [], parents: [], students: [],
  attendance: [], marks: [], fees: [], announcements: [], homework: [],
  timetable: {
    c1: ["English", "Mathematics", "Science", "Hindi", "Art", "Games"],
    c2: ["Mathematics", "English", "Social Science", "Science", "Computer", "Library"],
    c3: ["Science", "Mathematics", "English", "Social Science", "Sanskrit", "Games"],
    c4: ["Physics", "Chemistry", "Mathematics", "English", "Physical Ed.", "Physics Lab"],
  },
  admin: { id: "admin1", name: "Admin Office" },

  todayISO: () => new Date().toISOString().slice(0, 10),
  isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); },

  // ---- lookups (all read from the local, live-synced cache) ----
  classById(id) { return this.classes.find((c) => c.id === id); },
  classLabel(id) { const c = this.classById(id); return c ? `${c.name}-${c.section}` : "—"; },
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
  async addStudent(name, classId, roll, parentId) {
    const ref = doc(collection(db, "students"));
    await setDoc(ref, { name, classId, roll: Number(roll), parentId: parentId || null, dob: "" });
  },
  async removeStudent(id) { await deleteDoc(doc(db, "students", id)); },
  async addTeacher(name, subject, phone, username) {
    const ref = doc(collection(db, "teachers"));
    await setDoc(ref, { name, subject, phone, username, classIds: [] });
  },
  async removeTeacher(id) { await deleteDoc(doc(db, "teachers", id)); },

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
const COLLECTIONS = ["classes", "teachers", "parents", "students", "attendance", "marks", "fees", "announcements", "homework"];

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

  set("classes", "c1", { name: "VI", section: "A", classTeacherId: "t1" });
  set("classes", "c2", { name: "VII", section: "B", classTeacherId: "t2" });
  set("classes", "c3", { name: "IX", section: "A", classTeacherId: "t3" });
  set("classes", "c4", { name: "XI", section: "Science", classTeacherId: "t4" });

  set("teachers", "t1", { name: "Mrs. Kavita Sharma", subject: "English", phone: "9411000001", classIds: ["c1"], username: "kavita.sharma" });
  set("teachers", "t2", { name: "Mr. Ramesh Yadav", subject: "Mathematics", phone: "9411000002", classIds: ["c2"], username: "ramesh.yadav" });
  set("teachers", "t3", { name: "Ms. Priya Chauhan", subject: "Science", phone: "9411000003", classIds: ["c3"], username: "priya.chauhan" });
  set("teachers", "t4", { name: "Mr. Arvind Tyagi", subject: "Physics", phone: "9411000004", classIds: ["c4"], username: "arvind.tyagi" });

  set("parents", "p1", { name: "Ritu Malhotra", phone: "9822000001", username: "ritu.malhotra", childIds: ["s1"] });
  set("parents", "p2", { name: "Sanjeev Tyagi", phone: "9822000002", username: "sanjeev.tyagi", childIds: ["s2", "s3"] });
  set("parents", "p3", { name: "Anjali Chaudhary", phone: "9822000003", username: "anjali.chaudhary", childIds: ["s4"] });

  const students = [
    ["s1", "Aarav Malhotra", "c1", 4, "p1"], ["s2", "Ishaan Tyagi", "c2", 11, "p2"],
    ["s3", "Meher Tyagi", "c1", 9, "p2"], ["s4", "Diya Chaudhary", "c4", 2, "p3"],
    ["s5", "Kabir Singh", "c1", 1, null], ["s6", "Anaya Verma", "c1", 2, null],
    ["s7", "Vivaan Gupta", "c2", 3, null], ["s8", "Sara Khan", "c3", 5, null],
    ["s9", "Reyansh Rathi", "c3", 6, null], ["s10", "Zara Ansari", "c4", 7, null],
  ];
  students.forEach(([id, name, classId, roll, parentId]) => set("students", id, { name, classId, roll, parentId, dob: "" }));

  set("fees", "f1", { studentId: "s1", term: "Term 2 (2026-27)", amount: 18500, status: "paid", dueDate: "2026-07-15" });
  set("fees", "f2", { studentId: "s2", term: "Term 2 (2026-27)", amount: 19500, status: "pending", dueDate: "2026-09-05" });
  set("fees", "f3", { studentId: "s3", term: "Term 2 (2026-27)", amount: 18500, status: "pending", dueDate: "2026-09-05" });
  set("fees", "f4", { studentId: "s4", term: "Term 2 (2026-27)", amount: 24000, status: "overdue", dueDate: "2026-08-01" });
  set("fees", "f5", { studentId: "s5", term: "Term 2 (2026-27)", amount: 18500, status: "paid", dueDate: "2026-07-15" });

  set("announcements", "an1", { title: "PTM — Term 2 Progress", body: "Parent-Teacher Meeting for all classes will be held on 5 September.", audience: "parents", date: DB.isoDaysAgo(2), postedBy: "Admin Office" });
  set("announcements", "an2", { title: "Sports Day Rehearsal", body: "March-past rehearsal for Classes VI–VIII during the last period.", audience: "all", date: DB.isoDaysAgo(1), postedBy: "Admin Office" });
  set("announcements", "an3", { title: "Staff Meeting — Thursday", body: "All subject teachers to submit Term 2 question papers by Wednesday.", audience: "teachers", date: DB.isoDaysAgo(4), postedBy: "Principal's Office" });

  set("homework", "h1", { classId: "c1", subject: "English", description: "Read Chapter 4 and answer Q1–Q5.", dueDate: DB.isoDaysAgo(-2), postedBy: "t1" });
  set("homework", "h2", { classId: "c2", subject: "Mathematics", description: "Exercise 7.2, all questions.", dueDate: DB.isoDaysAgo(-3), postedBy: "t2" });
  set("homework", "h3", { classId: "c3", subject: "Science", description: "Diagram of the human digestive system.", dueDate: DB.isoDaysAgo(-1), postedBy: "t3" });

  await batch.commit();
  return true;
}
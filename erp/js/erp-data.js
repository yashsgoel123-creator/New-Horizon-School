/* =========================================================
   New Horizon School — ERP Data Layer
   -----------------------------------------------------------
   This is an IN-MEMORY mock database seeded with sample data.
   All portals (Admin / Teacher / Parent) read and write to the
   same DB object, so actions taken in one portal are reflected
   live in the others during this browser session.

   Data resets on page refresh — this is a front-end prototype.
   To make it persist for real (across devices, logins, days),
   swap the functions in this file for calls to a real backend
   — see README.md for a recommended free option (Firebase).
   ========================================================= */

const DB = (() => {

  const CLASSES = [
    { id: "c1", name: "VI",  section: "A", classTeacherId: "t1" },
    { id: "c2", name: "VII", section: "B", classTeacherId: "t2" },
    { id: "c3", name: "IX",  section: "A", classTeacherId: "t3" },
    { id: "c4", name: "XI",  section: "Science", classTeacherId: "t4" },
  ];

  const TEACHERS = [
    { id: "t1", name: "Mrs. Kavita Sharma", subject: "English",     phone: "9411000001", classIds: ["c1"], username: "kavita.sharma" },
    { id: "t2", name: "Mr. Ramesh Yadav",   subject: "Mathematics", phone: "9411000002", classIds: ["c2"], username: "ramesh.yadav" },
    { id: "t3", name: "Ms. Priya Chauhan",  subject: "Science",     phone: "9411000003", classIds: ["c3"], username: "priya.chauhan" },
    { id: "t4", name: "Mr. Arvind Tyagi",   subject: "Physics",     phone: "9411000004", classIds: ["c4"], username: "arvind.tyagi" },
  ];

  const PARENTS = [
    { id: "p1", name: "Ritu Malhotra",    phone: "9822000001", username: "ritu.malhotra",    childIds: ["s1"] },
    { id: "p2", name: "Sanjeev Tyagi",    phone: "9822000002", username: "sanjeev.tyagi",    childIds: ["s2", "s3"] },
    { id: "p3", name: "Anjali Chaudhary", phone: "9822000003", username: "anjali.chaudhary", childIds: ["s4"] },
  ];

  const STUDENTS = [
    { id: "s1", name: "Aarav Malhotra",  classId: "c1", roll: 4,  parentId: "p1", dob: "2015-03-12" },
    { id: "s2", name: "Ishaan Tyagi",    classId: "c2", roll: 11, parentId: "p2", dob: "2014-07-02" },
    { id: "s3", name: "Meher Tyagi",     classId: "c1", roll: 9,  parentId: "p2", dob: "2015-11-20" },
    { id: "s4", name: "Diya Chaudhary",  classId: "c4", roll: 2,  parentId: "p3", dob: "2010-01-15" },
    { id: "s5", name: "Kabir Singh",     classId: "c1", roll: 1,  parentId: null, dob: "2015-05-05" },
    { id: "s6", name: "Anaya Verma",     classId: "c1", roll: 2,  parentId: null, dob: "2015-08-19" },
    { id: "s7", name: "Vivaan Gupta",    classId: "c2", roll: 3,  parentId: null, dob: "2014-02-25" },
    { id: "s8", name: "Sara Khan",       classId: "c3", roll: 5,  parentId: null, dob: "2012-09-30" },
    { id: "s9", name: "Reyansh Rathi",   classId: "c3", roll: 6,  parentId: null, dob: "2012-04-11" },
    { id: "s10", name: "Zara Ansari",    classId: "c4", roll: 7,  parentId: null, dob: "2010-06-08" },
  ];

  // date helpers
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const isoDaysAgo = (n) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  // seed attendance: last 10 school days, per student, mostly present
  const ATTENDANCE = []; // {id, date, studentId, classId, status, markedBy}
  STUDENTS.forEach((s) => {
    for (let i = 1; i <= 10; i++) {
      const roll = Math.random();
      const status = roll > 0.92 ? "absent" : roll > 0.88 ? "leave" : "present";
      ATTENDANCE.push({
        id: `a-${s.id}-${i}`,
        date: isoDaysAgo(i),
        studentId: s.id,
        classId: s.classId,
        status,
        markedBy: "seed",
      });
    }
  });

  const MARKS = [
    { id: "m1", studentId: "s1", subject: "English",     exam: "Term 1", marks: 42, max: 50 },
    { id: "m2", studentId: "s1", subject: "Mathematics", exam: "Term 1", marks: 38, max: 50 },
    { id: "m3", studentId: "s1", subject: "Science",     exam: "Term 1", marks: 44, max: 50 },
    { id: "m4", studentId: "s2", subject: "Mathematics", exam: "Term 1", marks: 47, max: 50 },
    { id: "m5", studentId: "s2", subject: "English",     exam: "Term 1", marks: 33, max: 50 },
    { id: "m6", studentId: "s3", subject: "English",     exam: "Term 1", marks: 40, max: 50 },
    { id: "m7", studentId: "s4", subject: "Physics",     exam: "Term 1", marks: 71, max: 80 },
  ];

  const FEES = [
    { id: "f1", studentId: "s1", term: "Term 2 (2026-27)", amount: 18500, status: "paid",    dueDate: "2026-07-15" },
    { id: "f2", studentId: "s2", term: "Term 2 (2026-27)", amount: 19500, status: "pending",  dueDate: "2026-09-05" },
    { id: "f3", studentId: "s3", term: "Term 2 (2026-27)", amount: 18500, status: "pending",  dueDate: "2026-09-05" },
    { id: "f4", studentId: "s4", term: "Term 2 (2026-27)", amount: 24000, status: "overdue", dueDate: "2026-08-01" },
    { id: "f5", studentId: "s5", term: "Term 2 (2026-27)", amount: 18500, status: "paid",    dueDate: "2026-07-15" },
  ];

  const ANNOUNCEMENTS = [
    { id: "an1", title: "PTM — Term 2 Progress", body: "Parent-Teacher Meeting for all classes will be held on 5 September. Please check your ward's homework diary for the time slot.", audience: "parents", date: isoDaysAgo(2), postedBy: "Admin Office" },
    { id: "an2", title: "Sports Day Rehearsal", body: "March-past rehearsal for Classes VI–VIII on the main ground during the last period, weather permitting.", audience: "all", date: isoDaysAgo(1), postedBy: "Admin Office" },
    { id: "an3", title: "Staff Meeting — Thursday", body: "All subject teachers to submit Term 2 question papers to the coordinator by Wednesday EOD.", audience: "teachers", date: isoDaysAgo(4), postedBy: "Principal's Office" },
  ];

  const HOMEWORK = [
    { id: "h1", classId: "c1", subject: "English", description: "Read Chapter 4 of the reader and answer Q1–Q5 in the notebook.", dueDate: isoDaysAgo(-2), postedBy: "t1" },
    { id: "h2", classId: "c2", subject: "Mathematics", description: "Exercise 7.2, all questions. Show full working.", dueDate: isoDaysAgo(-3), postedBy: "t2" },
    { id: "h3", classId: "c3", subject: "Science", description: "Prepare a labelled diagram of the human digestive system.", dueDate: isoDaysAgo(-1), postedBy: "t3" },
  ];

  const TIMETABLE = {
    c1: ["English", "Mathematics", "Science", "Hindi", "Art", "Games"],
    c2: ["Mathematics", "English", "Social Science", "Science", "Computer", "Library"],
    c3: ["Science", "Mathematics", "English", "Social Science", "Sanskrit", "Games"],
    c4: ["Physics", "Chemistry", "Mathematics", "English", "Physical Ed.", "Physics Lab"],
  };

  // admin login (single office login)
  const ADMIN = { id: "admin1", name: "Admin Office", username: "admin" };

  let uidCounter = 1000;
  const nextId = (prefix) => `${prefix}${uidCounter++}`;

  return {
    todayISO, isoDaysAgo, nextId,
    classes: CLASSES, teachers: TEACHERS, parents: PARENTS, students: STUDENTS,
    attendance: ATTENDANCE, marks: MARKS, fees: FEES,
    announcements: ANNOUNCEMENTS, homework: HOMEWORK, timetable: TIMETABLE,
    admin: ADMIN,

    // ---- lookups ----
    classById(id) { return this.classes.find((c) => c.id === id); },
    classLabel(id) { const c = this.classById(id); return c ? `${c.name}-${c.section}` : "—"; },
    teacherById(id) { return this.teachers.find((t) => t.id === id); },
    parentById(id) { return this.parents.find((p) => p.id === id); },
    studentById(id) { return this.students.find((s) => s.id === id); },
    studentsInClass(classId) { return this.students.filter((s) => s.classId === classId).sort((a,b)=>a.roll-b.roll); },
    childrenOf(parentId) { return this.students.filter((s) => s.parentId === parentId); },
    classesForTeacher(teacherId) { return this.classes.filter((c) => c.classTeacherId === teacherId || this.teacherById(teacherId)?.classIds.includes(c.id)); },

    // ---- attendance ----
    markAttendance(classId, date, entries, markedBy) {
      // entries: [{studentId, status}]
      entries.forEach(({ studentId, status }) => {
        const existing = this.attendance.find((a) => a.studentId === studentId && a.date === date);
        if (existing) existing.status = status;
        else this.attendance.push({ id: this.nextId("a"), date, studentId, classId, status, markedBy });
      });
    },
    attendanceFor(studentId) {
      return this.attendance.filter((a) => a.studentId === studentId).sort((a,b)=> a.date < b.date ? 1 : -1);
    },
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

    // ---- marks ----
    addMarks(studentId, subject, exam, marks, max) {
      const existing = this.marks.find((m) => m.studentId === studentId && m.subject === subject && m.exam === exam);
      if (existing) { existing.marks = marks; existing.max = max; }
      else this.marks.push({ id: this.nextId("m"), studentId, subject, exam, marks, max });
    },
    marksFor(studentId) { return this.marks.filter((m) => m.studentId === studentId); },

    // ---- fees ----
    feesFor(studentId) { return this.fees.filter((f) => f.studentId === studentId); },
    markFeePaid(feeId) { const f = this.fees.find((x) => x.id === feeId); if (f) f.status = "paid"; },

    // ---- announcements ----
    addAnnouncement(title, body, audience, postedBy) {
      this.announcements.unshift({ id: this.nextId("an"), title, body, audience, date: this.todayISO(), postedBy });
    },
    announcementsFor(audience) {
      return this.announcements.filter((a) => a.audience === "all" || a.audience === audience);
    },

    // ---- homework ----
    addHomework(classId, subject, description, dueDate, postedBy) {
      this.homework.unshift({ id: this.nextId("h"), classId, subject, description, dueDate, postedBy });
    },
    homeworkForClass(classId) { return this.homework.filter((h) => h.classId === classId); },

    // ---- students/teachers CRUD (admin) ----
    addStudent(name, classId, roll, parentId) {
      this.students.push({ id: this.nextId("s"), name, classId, roll: Number(roll), parentId: parentId || null, dob: "" });
    },
    removeStudent(id) {
      this.students = this.students.filter((s) => s.id !== id);
    },
    addTeacher(name, subject, phone, username) {
      this.teachers.push({ id: this.nextId("t"), name, subject, phone, username, classIds: [] });
    },
    removeTeacher(id) {
      this.teachers = this.teachers.filter((t) => t.id !== id);
    },
  };
})();
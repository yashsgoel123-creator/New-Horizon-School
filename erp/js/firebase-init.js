// =========================================================
// New Horizon School — Firebase Initialization
// =========================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, getDocs, getDoc, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signOut as secondarySignOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtdfrygvZfyVY6zszVyclOh9EiANBfLvA",
  authDomain: "new-horizon-school-65304.firebaseapp.com",
  projectId: "new-horizon-school-65304",
  storageBucket: "new-horizon-school-65304.firebasestorage.app",
  messagingSenderId: "786900226984",
  appId: "1:786900226984:web:abe4525ff850af3d5d839d",
  measurementId: "G-GBC03F6S16",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ---------------------------------------------------------
// Secondary Firebase app instance — used ONLY to create new
// teacher/parent logins from inside the Admin portal without
// signing the admin themselves out. Firebase's Web SDK signs
// you in as whichever user you just created; running that on
// a second, throwaway app instance keeps the admin's own
// session on the primary `auth` untouched.
// ---------------------------------------------------------
function secondaryAuth() {
  const name = "Secondary";
  const secApp = getApps().some((a) => a.name === name) ? getApp(name) : initializeApp(firebaseConfig, name);
  return getAuth(secApp);
}

export async function createLoginAccount(email, password) {
  const sAuth = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(sAuth, email, password);
  const uid = cred.user.uid;
  await secondarySignOut(sAuth); // clears the throwaway session only — admin stays signed in on `auth`
  return uid;
}

// Lets the currently signed-in user (any role) change their own
// password. Firebase requires a "recent" login for this, so we
// re-verify their current password first.
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("You need to be signed in to change your password.");
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDocs, getDoc, query, where, writeBatch,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
};
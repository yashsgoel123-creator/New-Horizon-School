// =========================================================
// New Horizon School — Firebase Initialization
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, getDocs, getDoc, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
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

export {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDocs, getDoc, query, where, writeBatch,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
};
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC1_UFFhbqgMfqMWMnUH0w1jQGlGbk1PYs",
  authDomain: "pizzaria-2-irmaos.firebaseapp.com",
  projectId: "pizzaria-2-irmaos",
  storageBucket: "pizzaria-2-irmaos.firebasestorage.app",
  messagingSenderId: "322122443851",
  appId: "1:322122443851:web:578d930f1b15ccd491b1ce",
  measurementId: "G-2CN1EWFFXZ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCpV2BBY1t2UnZjYaZ7RATHvwxtGWSwxoU",
  authDomain: "easy-sds.firebaseapp.com",
  projectId: "easy-sds",
  storageBucket: "easy-sds.firebasestorage.app",
  messagingSenderId: "864132804780",
  appId: "1:864132804780:web:e0ee42eb8eb7b57114af09"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

window.FB = {
  facilityCode: null,
  facilityName: null,

  // Verify facility code against Firestore. On success, loads the facility's
  // chemical library into localStorage and returns the facility name.
  // Returns null if the code doesn't exist.
  async login(code) {
    const upper = code.trim().toUpperCase();
    let snap;
    try {
      snap = await getDoc(doc(db, 'facilities', upper));
    } catch (e) {
      console.error('Firebase login error:', e);
      return null;
    }
    if (!snap.exists()) return null;
    const data = snap.data();
    window.FB.facilityCode = upper;
    window.FB.facilityName = data.name || upper;
    sessionStorage.setItem('facilityCode', upper);
    localStorage.setItem('chemLabelLibrary', JSON.stringify(data.chemicals || []));
    return window.FB.facilityName;
  },

  // Write the current localStorage library back to this facility's Firestore doc.
  async push() {
    if (!window.FB.facilityCode) return;
    try {
      const lib = JSON.parse(localStorage.getItem('chemLabelLibrary') || '[]');
      await setDoc(
        doc(db, 'facilities', window.FB.facilityCode),
        { chemicals: lib },
        { merge: true }
      );
    } catch (e) {
      console.error('Firebase push error:', e);
    }
  },

  // Check a chemical name against the company blacklist in Firestore.
  // Returns true if the chemical is prohibited.
  async isBlacklisted(chemName) {
    try {
      const snap = await getDoc(doc(db, 'blacklist', 'prohibited'));
      if (!snap.exists()) return false;
      const list = snap.data().chemicals || [];
      return list.some(item =>
        (item.name || '').trim().toLowerCase() === chemName.trim().toLowerCase()
      );
    } catch (e) {
      console.error('Firebase blacklist error:', e);
      return false;
    }
  }
};

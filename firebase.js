import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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
  },

  // --- Admin functions ---

  // Sign in as admin using Firebase Authentication (Email/Password).
  // Returns true on success, false on bad credentials.
  async adminLogin(email, password) {
    try {
      await signInWithEmailAndPassword(getAuth(), email.trim(), password);
      return true;
    } catch (e) {
      console.error('Firebase adminLogin error:', e);
      return false;
    }
  },

  // Sign out the current admin Firebase Auth session.
  async adminSignOut() {
    try {
      await fbSignOut(getAuth());
    } catch (e) {
      console.error('Firebase adminSignOut error:', e);
    }
  },

  // Return the full blacklist array of { name } objects.
  async getBlacklist() {
    try {
      const snap = await getDoc(doc(db, 'blacklist', 'prohibited'));
      if (!snap.exists()) return [];
      return snap.data().chemicals || [];
    } catch (e) {
      console.error('Firebase getBlacklist error:', e);
      return [];
    }
  },

  // Overwrite the entire blacklist with an array of name strings or { name } objects.
  async setBlacklist(chemicals) {
    const normalized = chemicals.map(c =>
      typeof c === 'string' ? { name: c.trim() } : { name: (c.name || '').trim() }
    ).filter(c => c.name);
    await setDoc(doc(db, 'blacklist', 'prohibited'), { chemicals: normalized });
  },

  // Return array of { code, name, chemCount } for all facilities.
  async listFacilities() {
    try {
      const snap = await getDocs(collection(db, 'facilities'));
      return snap.docs.map(d => ({
        code: d.id,
        name: d.data().name || d.id,
        chemCount: (d.data().chemicals || []).length
      }));
    } catch (e) {
      console.error('Firebase listFacilities error:', e);
      return [];
    }
  },

  // Create or update a facility document.
  async createFacility(code, name) {
    const upper = code.trim().toUpperCase();
    await setDoc(
      doc(db, 'facilities', upper),
      { name: name.trim(), chemicals: [] },
      { merge: true }
    );
    return upper;
  },

  // Delete a facility document entirely.
  async deleteFacility(code) {
    await deleteDoc(doc(db, 'facilities', code.trim().toUpperCase()));
  },

  // Update only the name field of a facility (does not touch chemicals).
  async updateFacilityName(code, name) {
    await setDoc(
      doc(db, 'facilities', code.trim().toUpperCase()),
      { name: name.trim() },
      { merge: true }
    );
  },

  // Return the chemicals array for a specific facility (admin use — no localStorage side-effects).
  async getFacilityChemicals(code) {
    const snap = await getDoc(doc(db, 'facilities', code.trim().toUpperCase()));
    if (!snap.exists()) return [];
    return snap.data().chemicals || [];
  },

  // Overwrite the chemicals array for a specific facility.
  async setFacilityChemicals(code, chemicals) {
    await setDoc(
      doc(db, 'facilities', code.trim().toUpperCase()),
      { chemicals },
      { merge: true }
    );
  }
};

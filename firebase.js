import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, writeBatch, serverTimestamp, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
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

  // Check a chemical name against the blacklist. Checks both new per-document
  // format and the legacy single-document format during the migration window.
  async isBlacklisted(chemName) {
    try {
      const lc = chemName.trim().toLowerCase();
      // New format: query by nameLower field
      const q    = query(collection(db, 'blacklist'), where('nameLower', '==', lc));
      const snap = await getDocs(q);
      if (!snap.empty) return true;
      // Legacy fallback: check prohibited doc if it still exists
      const old = await getDoc(doc(db, 'blacklist', 'prohibited'));
      if (old.exists()) {
        return (old.data().chemicals || []).some(
          item => (item.name || '').trim().toLowerCase() === lc
        );
      }
      return false;
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

  // Return all blacklist chemicals as { id, name, addedAt, source } objects,
  // plus migration info if the legacy prohibited doc still exists.
  async getBlacklist() {
    try {
      const snap = await getDocs(collection(db, 'blacklist'));
      const prohibitedDoc = snap.docs.find(d => d.id === 'prohibited');
      const chemicals = snap.docs
        .filter(d => d.id !== 'prohibited')
        .map(d => ({
          ...d.data(),                // all stored fields (cas_no, hazard, etc.)
          id:      d.id,
          addedAt: d.data().addedAt ? d.data().addedAt.toDate() : null
        }));
      return {
        chemicals,
        needsMigration: !!prohibitedDoc,
        migrationCount: prohibitedDoc ? (prohibitedDoc.data().chemicals || []).length : 0
      };
    } catch (e) {
      console.error('Firebase getBlacklist error:', e);
      return { chemicals: [], needsMigration: false, migrationCount: 0 };
    }
  },

  // Add a single chemical to the blacklist. extra = any additional fields to store.
  // Returns the new document ID.
  async addToBlacklist(name, source = 'manual', extra = {}) {
    const ref = await addDoc(collection(db, 'blacklist'), {
      ...extra,
      name:      name.trim(),
      nameLower: name.trim().toLowerCase(),
      addedAt:   serverTimestamp(),
      source
    });
    return ref.id;
  },

  // Remove a blacklist chemical by document ID.
  async removeFromBlacklist(docId) {
    await deleteDoc(doc(db, 'blacklist', docId));
  },

  // Batch-update metadata fields on existing blacklist documents.
  // updates = [{ id, fields }] where fields are the extra columns to write.
  // Never overwrites name, nameLower, addedAt, or source.
  async updateManyBlacklistMeta(updates) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      updates.slice(i, i + BATCH_SIZE).forEach(({ id, fields }) => {
        batch.update(doc(db, 'blacklist', id), fields);
      });
      await batch.commit();
    }
  },

  // Batch-add many chemicals. Each item may be a plain string (name only)
  // or an object { name, ...extraFields }. Splits into 500-op batches.
  async addManyToBlacklist(chemicals, source = 'csv-upload') {
    const BATCH_SIZE = 500;
    for (let i = 0; i < chemicals.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      chemicals.slice(i, i + BATCH_SIZE).forEach(chem => {
        const { name, ...extra } = typeof chem === 'string' ? { name: chem } : chem;
        const ref = doc(collection(db, 'blacklist'));
        batch.set(ref, {
          ...extra,
          name:      name.trim(),
          nameLower: name.trim().toLowerCase(),
          addedAt:   serverTimestamp(),
          source
        });
      });
      await batch.commit();
    }
  },

  // One-time migration: converts the legacy /blacklist/prohibited array
  // into individual documents, then deletes the old document.
  async migrateBlacklist() {
    const prohibited = await getDoc(doc(db, 'blacklist', 'prohibited'));
    if (!prohibited.exists()) return { count: 0 };
    const chemicals = prohibited.data().chemicals || [];
    // Skip any names already migrated
    const existing  = await getDocs(collection(db, 'blacklist'));
    const doneNames = new Set(
      existing.docs.filter(d => d.id !== 'prohibited').map(d => d.data().nameLower)
    );
    const toMigrate = chemicals.filter(c => !doneNames.has((c.name || '').toLowerCase()));
    if (toMigrate.length) {
      await window.FB.addManyToBlacklist(toMigrate.map(c => c.name), 'migration');
    }
    await deleteDoc(doc(db, 'blacklist', 'prohibited'));
    return { count: toMigrate.length };
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

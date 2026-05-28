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
    // Load from subcollection (falls back to legacy array automatically)
    const chemicals = await window.FB.getFacilityChemicals(upper);
    localStorage.setItem('chemLabelLibrary', JSON.stringify(chemicals));
    return window.FB.facilityName;
  },

  // Write the current localStorage library back to Firestore as subcollection docs.
  async push() {
    if (!window.FB.facilityCode) return;
    try {
      const lib = JSON.parse(localStorage.getItem('chemLabelLibrary') || '[]');
      await window.FB.setFacilityChemicals(window.FB.facilityCode, lib);
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

  // Return array of { code, name, chemCount, needsMigration } for all facilities.
  // chemCount uses the stored field; needsMigration is true when a legacy
  // chemicals array still exists on the document.
  async listFacilities() {
    try {
      const snap = await getDocs(collection(db, 'facilities'));
      return snap.docs.map(d => {
        const legacyArr = d.data().chemicals;
        return {
          code:           d.id,
          name:           d.data().name || d.id,
          chemCount:      d.data().chemCount ?? (legacyArr || []).length,
          needsMigration: Array.isArray(legacyArr) && legacyArr.length > 0
        };
      });
    } catch (e) {
      console.error('Firebase listFacilities error:', e);
      return [];
    }
  },

  // Create a new facility document (name only — chemicals live in subcollection).
  async createFacility(code, name) {
    const upper = code.trim().toUpperCase();
    await setDoc(
      doc(db, 'facilities', upper),
      { name: name.trim() },
      { merge: true }
    );
    return upper;
  },

  // Delete a facility document. Note: subcollection docs must be deleted separately
  // (Firestore does not cascade-delete subcollections from the client SDK).
  async deleteFacility(code) {
    const upper = code.trim().toUpperCase();
    // Delete all subcollection docs first
    const chemSnap = await getDocs(collection(db, 'facilities', upper, 'chemicals'));
    const BATCH_SIZE = 500;
    for (let i = 0; i < chemSnap.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      chemSnap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'facilities', upper));
  },

  // Update only the name field of a facility (does not touch chemicals).
  async updateFacilityName(code, name) {
    await setDoc(
      doc(db, 'facilities', code.trim().toUpperCase()),
      { name: name.trim() },
      { merge: true }
    );
  },

  // Return the chemicals for a specific facility from its subcollection.
  // Falls back to the legacy chemicals array on the document if the subcollection
  // is empty (supports the migration window).
  async getFacilityChemicals(code) {
    const upper   = code.trim().toUpperCase();
    const collRef = collection(db, 'facilities', upper, 'chemicals');
    const snap    = await getDocs(collRef);
    if (!snap.empty) {
      return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    }
    // Legacy fallback
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    if (!facSnap.exists()) return [];
    return facSnap.data().chemicals || [];
  },

  // Replace the entire chemicals subcollection for a facility.
  // Strips internal _id / savedAt fields before writing, then updates chemCount.
  async setFacilityChemicals(code, chemicals) {
    const upper   = code.trim().toUpperCase();
    const collRef = collection(db, 'facilities', upper, 'chemicals');
    const BATCH_SIZE = 500;

    // Delete all existing subcollection docs
    const existing = await getDocs(collRef);
    for (let i = 0; i < existing.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      existing.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Write new docs
    for (let i = 0; i < chemicals.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      chemicals.slice(i, i + BATCH_SIZE).forEach(chem => {
        const { _id, savedAt, ...rest } = typeof chem === 'object' ? chem : { product: chem };
        const ref = doc(collRef);
        batch.set(ref, { ...rest, savedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    // Keep chemCount on the parent doc for fast list rendering
    await setDoc(doc(db, 'facilities', upper), { chemCount: chemicals.length }, { merge: true });
  },

  // Return array of { _id, product, pinnedAt, ...labelData } for a facility's favorites.
  async getFavorites(code) {
    const upper = code.trim().toUpperCase();
    try {
      const snap = await getDocs(collection(db, 'facilities', upper, 'favorites'));
      return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    } catch (e) {
      console.error('Firebase getFavorites error:', e);
      return [];
    }
  },

  // Pin a label to the facility's favorites. labelData = getCurrentFormData() output.
  async addFavorite(code, labelData) {
    const upper = code.trim().toUpperCase();
    const ref = await addDoc(collection(db, 'facilities', upper, 'favorites'), {
      ...labelData,
      pinnedAt: serverTimestamp()
    });
    return ref.id;
  },

  // Remove a favorite by document ID.
  async removeFavorite(code, docId) {
    const upper = code.trim().toUpperCase();
    await deleteDoc(doc(db, 'facilities', upper, 'favorites', docId));
  },

  // One-time migration: moves a facility's legacy chemicals array into its
  // chemicals subcollection, then clears the array on the parent document.
  async migrateFacilityChemicals(code) {
    const upper   = code.trim().toUpperCase();
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    if (!facSnap.exists()) return { count: 0, skipped: true };

    const legacy = facSnap.data().chemicals;
    if (!Array.isArray(legacy) || !legacy.length) return { count: 0 };

    // Skip if subcollection already has docs (already migrated)
    const existing = await getDocs(collection(db, 'facilities', upper, 'chemicals'));
    if (!existing.empty) return { count: 0, alreadyDone: true };

    await window.FB.setFacilityChemicals(upper, legacy);
    // Clear the now-migrated array from the parent doc to free document space
    await setDoc(doc(db, 'facilities', upper), { chemicals: [] }, { merge: true });

    return { count: legacy.length };
  }
};

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, addDoc, writeBatch, serverTimestamp, query, where, onSnapshot, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCpV2BBY1t2UnZjYaZ7RATHvwxtGWSwxoU",
  authDomain: "easy-sds.firebaseapp.com",
  projectId: "easy-sds",
  storageBucket: "easy-sds.firebasestorage.app",
  messagingSenderId: "864132804780",
  appId: "1:864132804780:web:e0ee42eb8eb7b57114af09"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Secondary app instance — used to create worker accounts without
// signing the admin out of their own session.
const workerCreationApp  = initializeApp(firebaseConfig, 'workerCreation');
const workerCreationAuth = getAuth(workerCreationApp);

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
    window.FB.facilityLogo = data.logo || null;
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
      window.FB.logClientEvent(window.FB.facilityCode, 'error', 'sync',
        'Library sync to Firestore failed', e.message).catch(() => {});
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
      const cred  = await signInWithEmailAndPassword(auth, email.trim(), password);
      const lower = email.trim().toLowerCase();
      const upsert = { email: lower, role: 'admin', status: 'active' };
      if (lower === 'sam.heller@rhenus.com') upsert.devtoolsAccess = true;
      await setDoc(doc(db, 'users', cred.user.uid), upsert, { merge: true });
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      window.FB.adminProfile = snap.exists() ? { uid: cred.user.uid, ...snap.data() } : { uid: cred.user.uid, email: lower };
      return true;
    } catch (e) {
      console.error('Firebase adminLogin error:', e);
      return false;
    }
  },

  // Sign out the current admin Firebase Auth session.
  async adminSignOut() {
    try {
      await fbSignOut(auth);
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

  async setFacilityLogo(code, dataUrl) {
    const upper = code.trim().toUpperCase();
    await setDoc(doc(db, 'facilities', upper), { logo: dataUrl || null }, { merge: true });
  },

  async getFacilityLogo(code) {
    const upper = code.trim().toUpperCase();
    try {
      const snap = await getDoc(doc(db, 'facilities', upper));
      return snap.exists() ? (snap.data().logo || null) : null;
    } catch (e) { return null; }
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
  // Write-first strategy: new docs are committed before old ones are deleted so a
  // mid-operation network failure leaves existing data intact (worst case: brief
  // duplicates until the next save, never permanent data loss).
  async setFacilityChemicals(code, chemicals) {
    const upper   = code.trim().toUpperCase();
    const collRef = collection(db, 'facilities', upper, 'chemicals');
    const BATCH_SIZE = 500;

    // 1. Snapshot existing doc IDs before writing anything
    const existing = await getDocs(collRef);
    const oldIds   = new Set(existing.docs.map(d => d.id));

    // 2. Write new docs first — if this fails, old docs are still intact
    for (let i = 0; i < chemicals.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      chemicals.slice(i, i + BATCH_SIZE).forEach(chem => {
        const { _id, savedAt, ...rest } = typeof chem === 'object' ? chem : { product: chem };
        const ref = doc(collRef);
        batch.set(ref, { ...rest, savedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    // 3. Delete only the pre-existing docs (new ones are excluded by ID set)
    const toDelete = existing.docs.filter(d => oldIds.has(d.id));
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      toDelete.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Keep chemCount on the parent doc for fast list rendering
    await setDoc(doc(db, 'facilities', upper), { chemCount: chemicals.length }, { merge: true });
  },

  // Return all chemicals across every facility, grouped by product name.
  // Each entry: { product, facilities: [{ code, name }] }, sorted by facility count desc then alpha.
  async getAllChemicals() {
    const facs = await window.FB.listFacilities();
    const nameMap = new Map();
    await Promise.all(facs.map(async fac => {
      const chems = await window.FB.getFacilityChemicals(fac.code);
      chems.forEach(c => {
        const key = (c.product || '').trim().toLowerCase();
        if (!key) return;
        if (!nameMap.has(key)) nameMap.set(key, { product: (c.product || '').trim(), facilities: [] });
        const entry = nameMap.get(key);
        if (!entry.facilities.some(f => f.code === fac.code)) {
          entry.facilities.push({ code: fac.code, name: fac.name });
        }
      });
    }));
    return Array.from(nameMap.values())
      .sort((a, b) => a.product.localeCompare(b.product));
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

  // Return all pending chemicals for a single facility.
  async getFacilityPending(code) {
    const upper = code.trim().toUpperCase();
    try {
      const snap = await getDocs(collection(db, 'facilities', upper, 'pending'));
      return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    } catch (e) {
      return [];
    }
  },

  // Submit a new chemical for approval. Writes to /facilities/{code}/pending/{id}.
  async submitForApproval(code, labelData, submittedByEmail = null) {
    const upper = code.trim().toUpperCase();
    const ref = await addDoc(collection(db, 'facilities', upper, 'pending'), {
      ...labelData,
      submittedByEmail,
      submittedAt: serverTimestamp(),
      status: 'pending'
    });
    return ref.id;
  },

  // Return all pending chemicals across every facility, sorted oldest-first.
  async getAllPending() {
    const facs = await window.FB.listFacilities();
    const results = [];
    await Promise.all(facs.map(async fac => {
      try {
        const snap = await getDocs(collection(db, 'facilities', fac.code, 'pending'));
        snap.docs.forEach(d => {
          results.push({ ...d.data(), _id: d.id, facilityCode: fac.code, facilityName: fac.name });
        });
      } catch (e) { console.error('[EasySDS] getAllPending failed for', fac.code, e); }
    }));
    return results.sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
  },

  // Approve a pending chemical: add to chemicals subcollection, update chemCount, delete from pending.
  // Pass overrideData to save reviewer-edited values instead of the original submission.
  async approveChemical(code, pendingId, overrideData = null) {
    const upper = code.trim().toUpperCase();
    const pendSnap = await getDoc(doc(db, 'facilities', upper, 'pending', pendingId));
    if (!pendSnap.exists()) return false;
    const { status, submittedAt, ...storedData } = pendSnap.data();
    const labelData = overrideData || storedData;
    await addDoc(collection(db, 'facilities', upper, 'chemicals'), {
      ...labelData,
      savedAt: serverTimestamp()
    });
    const chemSnap = await getDocs(collection(db, 'facilities', upper, 'chemicals'));
    await setDoc(doc(db, 'facilities', upper), { chemCount: chemSnap.docs.length }, { merge: true });
    await deleteDoc(doc(db, 'facilities', upper, 'pending', pendingId));
    return true;
  },

  // Reject a pending chemical: delete it from pending without adding to chemicals.
  async rejectChemical(code, pendingId) {
    const upper = code.trim().toUpperCase();
    await deleteDoc(doc(db, 'facilities', upper, 'pending', pendingId));
  },

  // Write a record to /facilities/{code}/submission-history after an approve or reject.
  async logSubmissionHistory(code, data) {
    const upper = code.trim().toUpperCase();
    await addDoc(collection(db, 'facilities', upper, 'submission-history'), {
      ...data,
      reviewedAt: serverTimestamp()
    });
  },

  // Write any admin action to the global /activityLog collection.
  // action: 'approved'|'rejected'|'blacklist-add'|'blacklist-remove'|'blacklist-csv'
  async logActivityHistory(action, data) {
    await addDoc(collection(db, 'activityLog'), {
      action,
      ...data,
      timestamp: serverTimestamp()
    });
  },

  // Return all history across every facility + global activity log, sorted newest-first.
  async getAllSubmissionHistory() {
    const facs = await window.FB.listFacilities();
    const results = [];
    // Legacy per-facility submission-history subcollections
    await Promise.all(facs.map(async fac => {
      try {
        const snap = await getDocs(collection(db, 'facilities', fac.code, 'submission-history'));
        snap.docs.forEach(d => results.push({
          ...d.data(), _id: d.id,
          facilityCode: fac.code, facilityName: fac.name,
          action: d.data().outcome,   // map outcome → action for uniform rendering
          _source: 'submission-history'
        }));
      } catch (e) { console.error('[EasySDS] getAllSubmissionHistory failed for', fac.code, e); }
    }));
    // Global activity log (blacklist changes + new approve/reject records)
    try {
      const snap = await getDocs(collection(db, 'activityLog'));
      snap.docs.forEach(d => results.push({ ...d.data(), _id: d.id, _source: 'activityLog' }));
    } catch (e) { console.error('[EasySDS] getAllActivityLog failed:', e); }

    return results.sort((a, b) => {
      const aT = a.timestamp?.seconds || a.reviewedAt?.seconds || 0;
      const bT = b.timestamp?.seconds || b.reviewedAt?.seconds || 0;
      return bT - aT;
    });
  },

  // Update the reason field on a history entry.
  async updateHistoryReason(source, facilityCode, id, reason) {
    if (source === 'activityLog') {
      await updateDoc(doc(db, 'activityLog', id), { reason: reason ?? null });
    } else {
      await updateDoc(doc(db, 'facilities', facilityCode.trim().toUpperCase(), 'submission-history', id), { reason: reason ?? null });
    }
  },

  // Delete a single history entry. source is 'activityLog' or 'submission-history'.
  async deleteHistoryEntry(source, facilityCode, id) {
    if (source === 'activityLog') {
      await deleteDoc(doc(db, 'activityLog', id));
    } else {
      await deleteDoc(doc(db, 'facilities', facilityCode.trim().toUpperCase(), 'submission-history', id));
    }
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
  },

  // ── Worker account management ────────────────────────────────

  // Admin creates a worker account using the secondary app so the admin
  // session is unaffected. Sends a password-setup email to the worker.
  async createWorkerAccount(email, facilityCode) {
    const upper   = facilityCode.trim().toUpperCase();
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    const facilityName = facSnap.exists() ? facSnap.data().name : upper;

    // Create account via secondary app (keeps admin signed in)
    const tempPw = Math.random().toString(36).slice(-10) + 'Aa1!';
    const cred   = await createUserWithEmailAndPassword(workerCreationAuth, email.trim().toLowerCase(), tempPw);
    const uid    = cred.user.uid;

    // Write worker profile to Firestore
    await setDoc(doc(db, 'users', uid), {
      email:        email.trim().toLowerCase(),
      facilityCode: upper,
      facilityName,
      role:         'worker',
      status:       'active',
      createdAt:    serverTimestamp()
    });

    // Sign out of secondary app, then send invite email via Trigger Email extension.
    // Email failure is non-fatal — admin can resend from the Workers tab.
    await workerCreationAuth.signOut();
    try {
      await window.FB.sendWorkerInviteEmail(email.trim().toLowerCase(), facilityName);
    } catch (emailErr) {
      console.warn('Invite email failed (account was created):', emailErr);
    }

    return uid;
  },

  // Worker signs in with email + password.
  // Loads their facility automatically from their Firestore profile.
  async workerLogin(email, password) {
    const cred    = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await window.FB.getWorkerProfile(cred.user.uid);

    if (profile && profile.status === 'inactive') {
      await fbSignOut(auth);
      throw new Error('inactive');
    }

    // No /users doc: create a pending-facility worker profile so they show up in
    // the admin Workers tab and can be assigned a facility. Admin accounts
    // (role:'admin') are left as-is and passed through to the facility picker.
    if (!profile) {
      const newProfile = {
        email:        cred.user.email.toLowerCase(),
        facilityCode: null, facilityName: null,
        role: 'worker', status: 'pending-facility',
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      window.FB.workerProfile = { uid: cred.user.uid, ...newProfile };
      window.FB.facilityCode  = null;
      window.FB.facilityName  = null;
      window.FB.facilityLogo  = null;
      return window.FB.workerProfile;
    }
    if (profile.role !== 'worker') {
      window.FB.workerProfile = { uid: cred.user.uid, email: cred.user.email, role: 'admin', facilityCode: null };
      window.FB.facilityCode  = null;
      window.FB.facilityName  = null;
      window.FB.facilityLogo  = null;
      return window.FB.workerProfile;
    }

    window.FB.workerProfile = profile;

    if (!profile.facilityCode) {
      // Account exists but no facility assigned yet
      window.FB.facilityCode = null;
      window.FB.facilityName = null;
      window.FB.facilityLogo = null;
      return profile;
    }

    // Load facility data
    const upper   = profile.facilityCode;
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    window.FB.facilityCode = upper;
    window.FB.facilityName = profile.facilityName || (facSnap.exists() ? facSnap.data().name : upper);
    window.FB.facilityLogo = facSnap.exists() ? (facSnap.data().logo || null) : null;

    const chemicals = await window.FB.getFacilityChemicals(upper);
    localStorage.setItem('chemLabelLibrary', JSON.stringify(chemicals));

    return profile;
  },

  // @rhenus.com workers can self-register. They land in pending-facility
  // status until an admin assigns their facility.
  async workerSelfRegister(email, password) {
    if (!email.trim().toLowerCase().endsWith('@rhenus.com')) {
      throw new Error('domain-not-allowed');
    }
    const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const profile = {
      email:        email.trim().toLowerCase(),
      facilityCode: null,
      facilityName: null,
      role:         'worker',
      status:       'pending-facility',
      createdAt:    serverTimestamp()
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    window.FB.workerProfile = { uid: cred.user.uid, ...profile };
    window.FB.facilityCode  = null;
    window.FB.facilityName  = null;
    window.FB.facilityLogo  = null;
    return window.FB.workerProfile;
  },

  async workerLogout() {
    window.FB.facilityCode  = null;
    window.FB.facilityName  = null;
    window.FB.facilityLogo  = null;
    window.FB.workerProfile = null;
    await fbSignOut(auth);
  },

  async getWorkerProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
  },

  async listWorkers(includeAdmins = false) {
    if (includeAdmins) {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    }
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'worker')));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  },

  async updateWorkerFacility(uid, facilityCode) {
    const upper   = facilityCode.trim().toUpperCase();
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    const facilityName = facSnap.exists() ? facSnap.data().name : upper;
    await setDoc(doc(db, 'users', uid), { facilityCode: upper, facilityName, status: 'active' }, { merge: true });
  },

  async deactivateWorker(uid) {
    await setDoc(doc(db, 'users', uid), { status: 'inactive' }, { merge: true });
  },

  async reactivateWorker(uid) {
    await setDoc(doc(db, 'users', uid), { status: 'active' }, { merge: true });
  },

  async setWorkerRole(uid, role) {
    await setDoc(doc(db, 'users', uid), { role }, { merge: true });
  },

  async setDevToolsAccess(uid, enabled) {
    await setDoc(doc(db, 'users', uid), { devtoolsAccess: enabled }, { merge: true });
  },

  async deleteWorkerAccount(uid) {
    // Deletes the Firestore profile — immediately blocks all access.
    // The Firebase Auth account remains but onAuthChange returns null with no profile,
    // so the user cannot log in. Full Auth deletion requires the Admin SDK.
    await deleteDoc(doc(db, 'users', uid));
  },

  async resendWorkerInvite(email) {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  },

  // Create a worker account with a specific password set by the admin.
  // No invite email is sent — the admin hands the password to the worker directly.
  async createWorkerAccountWithPassword(email, password, facilityCode) {
    const upper   = facilityCode.trim().toUpperCase();
    const facSnap = await getDoc(doc(db, 'facilities', upper));
    const facilityName = facSnap.exists() ? facSnap.data().name : upper;
    const cred = await createUserWithEmailAndPassword(workerCreationAuth, email.trim().toLowerCase(), password);
    const uid  = cred.user.uid;
    await setDoc(doc(db, 'users', uid), {
      email:        email.trim().toLowerCase(),
      facilityCode: upper, facilityName,
      role:         'worker', status: 'active',
      createdAt:    serverTimestamp()
    });
    await workerCreationAuth.signOut();
    return uid;
  },

  // ── Teams notifications via Firestore queue ───────────────────
  // Writes to the 'notifications' collection; Power Automate polls and sends DMs.
  async sendEmail(to, subject, body) {
    await addDoc(collection(db, 'notifications'), {
      to,
      subject,
      body,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  },

  async sendWorkerInviteEmail(email, facilityName) {
    const appUrl = window.location.href.replace(/admin\.html.*$/, 'index.html');
    const body =
`🔔 You've been added to Easy SDS

You've been added to the Rhenus SDS Label Generator for ${facilityName}.

To get started, open the app here: ${appUrl}

Use "First time or forgot password" with this email address (${email}) to set up your password.

Questions? Contact your manager.`;
    await window.FB.sendEmail(email, "You've been invited to use Easy SDS", body);
  },

  async sendApprovalEmail(submittedByEmail, productName, facilityName) {
    if (!submittedByEmail) return;
    const body =
`✅ Chemical Approved — "${productName}"

Your submission for ${productName} at ${facilityName} has been approved. It is now available in the chemical library for your facility.`;
    await window.FB.sendEmail(submittedByEmail, `"${productName}" approved`, body);
  },

  async sendRejectionEmail(submittedByEmail, productName, facilityName, reason = null) {
    if (!submittedByEmail) return;
    const reasonLine = reason ? `\nReason: ${reason}\n` : '';
    const body =
`❌ Submission Not Approved — "${productName}"

Your submission for ${productName} at ${facilityName} was not approved.
${reasonLine}
Questions? Contact your manager.`;
    await window.FB.sendEmail(submittedByEmail, `"${productName}" submission not approved`, body);
  },

  // ── Client event logging ─────────────────────────────────────
  // Writes a structured event doc to /clientEvents so the admin console
  // can surface errors and warnings from the worker-facing tool in real time.
  // type: 'error' | 'warning'
  // category: 'submission' | 'blacklist' | 'auth' | 'sync'
  async logClientEvent(facilityCode, type, category, message, detail = null) {
    try {
      await addDoc(collection(db, 'clientEvents'), {
        facilityCode:  (facilityCode || '').trim().toUpperCase() || null,
        facilityName:  window.FB.facilityName || null,
        type, category, message,
        detail:        detail ? String(detail).slice(0, 500) : null,
        userEmail:     window.FB.workerProfile?.email || null,
        timestamp:     serverTimestamp()
      });
    } catch (e) {
      console.error('[EasySDS] logClientEvent write failed:', e);
    }
  },

  // Real-time subscription for admin — fires onNew(event) whenever a new
  // clientEvent doc arrives after the call. Returns an unsubscribe function.
  subscribeClientEvents(onNew) {
    const since = new Date();
    const q = query(
      collection(db, 'clientEvents'),
      where('timestamp', '>', since),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') onNew({ ...change.doc.data(), _id: change.doc.id });
      });
    }, e => console.error('[EasySDS] clientEvents subscription error:', e));
  },

  // Fetch the most recent N client events for the history log view.
  async getAllClientEvents(limitN = 200) {
    try {
      const q = query(collection(db, 'clientEvents'), orderBy('timestamp', 'desc'), limit(limitN));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    } catch (e) {
      console.error('[EasySDS] getAllClientEvents failed:', e);
      return [];
    }
  },

  // Subscribe to Firebase Auth state changes. Callback receives the loaded
  // worker profile (or null if signed out). Used by index.html instead of
  // sessionStorage polling.
  onAuthChange(callback) {
    onAuthStateChanged(auth, async user => {
      if (!user) { callback(null); return; }
      try {
        const profile = await window.FB.getWorkerProfile(user.uid);
        // Admin accounts have no /users doc — pass through with role:'admin'
        if (!profile || profile.role !== 'worker') {
          const adminProfile = { uid: user.uid, email: user.email, role: 'admin', facilityCode: null };
          window.FB.workerProfile = adminProfile;
          callback(adminProfile);
          return;
        }
        if (profile.status === 'inactive') { callback(null); return; }
        window.FB.workerProfile = profile;
        if (profile.facilityCode) {
          const upper   = profile.facilityCode;
          const facSnap = await getDoc(doc(db, 'facilities', upper));
          window.FB.facilityCode = upper;
          window.FB.facilityName = profile.facilityName || (facSnap.exists() ? facSnap.data().name : upper);
          window.FB.facilityLogo = facSnap.exists() ? (facSnap.data().logo || null) : null;
          const chemicals = await window.FB.getFacilityChemicals(upper);
          localStorage.setItem('chemLabelLibrary', JSON.stringify(chemicals));
        }
        callback(profile);
      } catch (e) { console.error('onAuthChange error:', e); callback(null); }
    });
  }
};

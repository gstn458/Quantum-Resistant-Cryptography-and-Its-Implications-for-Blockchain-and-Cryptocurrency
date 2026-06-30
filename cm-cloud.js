/* =====================================================================
   CryptoMath — cloud progress sync (Firebase Auth + Firestore)
   ---------------------------------------------------------------------
   This makes XP / streak / completed-lesson progress durable and synced
   across devices, instead of being trapped in a single browser.

   IT IS SAFE TO SHIP AS-IS: if Firestore isn't enabled yet it simply
   no-ops and the site keeps using localStorage.

   >>> TO ACTIVATE (one-time, in your Firebase console) <<<
   1. Build > Firestore Database > Create database (production mode).
   2. Authentication > Sign-in method > enable Google (already used) and,
      if you want, Email/Password with "Email verification" on.
   3. Publish these security rules so each user can only touch their doc:

        rules_version = '2';
        service cloud.firestore {
          match /databases/{db}/documents {
            match /users/{uid} {
              allow read, write: if request.auth != null && request.auth.uid == uid;
            }
          }
        }

   The Firebase web API key below is public by design (it identifies the
   project, it is not a secret); security is enforced by the rules above.
   ===================================================================== */
(function () {
  "use strict";
  var STORE = "cme_progress_v1";
  var cfg = {
    apiKey: "AIzaSyANsJMtnMV2YsMNKUOPMJTYxyYy1JT8-Y4",
    authDomain: "cryptomath-8acd5.firebaseapp.com",
    projectId: "cryptomath-8acd5",
    storageBucket: "cryptomath-8acd5.firebasestorage.app"
  };

  function localGet() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function localSet(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) {} }

  // Merge two progress objects: keep the higher XP/streak, union lessons.
  function merge(a, b) {
    a = a || {}; b = b || {};
    var out = Object.assign({}, a, b);
    out.xp = Math.max(a.xp || 0, b.xp || 0);
    out.streak = Math.max(a.streak || 0, b.streak || 0);
    out.freezes = Math.max(a.freezes || 0, b.freezes || 0);
    out.lessons = Object.assign({}, a.lessons || {}, b.lessons || {});
    return out;
  }

  function init() {
    if (!window.firebase || !firebase.firestore) {
      // Firestore SDK not present on this page — stay local-only.
      return;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(cfg);
    } catch (e) { return; }
    var db, auth;
    try { db = firebase.firestore(); auth = firebase.auth(); } catch (e) { return; }

    auth.onAuthStateChanged(function (user) {
      if (!user) return;
      var ref = db.collection("users").doc(user.uid);
      ref.get().then(function (snap) {
        var cloud = snap.exists ? (snap.data().progress || {}) : {};
        var merged = merge(localGet(), cloud);
        localSet(merged);
        ref.set({ progress: merged, email: user.email || null, updated: Date.now() }, { merge: true });
        // push local changes up periodically
        window.CMcloud = {
          push: function () { ref.set({ progress: localGet(), updated: Date.now() }, { merge: true }); }
        };
        window.addEventListener("beforeunload", function () { try { window.CMcloud.push(); } catch (e) {} });
        setInterval(function () { try { window.CMcloud.push(); } catch (e) {} }, 60000);
      }).catch(function () { /* rules not set / offline -> stay local */ });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

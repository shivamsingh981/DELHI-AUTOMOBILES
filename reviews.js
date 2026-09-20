/* Delhi Automobiles – live customer reviews
 *
 * HOW IT WORKS
 * Visitors post a review from the form. It is saved to Firebase Firestore
 * and appears on the page straight away for everyone.
 *
 * SETUP (5 minutes, free plan is enough)
 * 1. Go to console.firebase.google.com and create a project.
 * 2. Build > Firestore Database > Create database (production mode).
 * 3. Firestore > Rules: paste the contents of firestore.rules and Publish.
 * 4. Project settings > Your apps > Web app (</>) > copy the config values.
 * 5. Paste them below. Save, upload, done.
 *
 * PHOTOS
 * Visitors can attach up to 3 photos. Each is shrunk in the browser
 * (about 1000px, JPEG) and stored inside the review document itself, so
 * no extra Firebase Storage setup is needed. Re-publish firestore.rules
 * after updating: it now allows the "images" field.
 *
 * Until the Firebase details are pasted in, the form runs in DEMO mode: reviews are saved only
 * in the visitor's own browser. No sample reviews are shown.
 */
(function () {
  "use strict";

  /* ===== PASTE YOUR FIREBASE WEB CONFIG HERE ===== */
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyA16BZ3p33Er8V1hz9T6V-qXu-jdtEvfuA",
    authDomain: "delhi-automobiles.firebaseapp.com",
    projectId: "delhi-automobiles",
    storageBucket: "delhi-automobiles.firebasestorage.app",
    messagingSenderId: "141394078881",
    appId: "1:141394078881:web:6e7706e9834f6643f1d4e0"
  };
  /* =============================================== */

  var COLLECTION = "delhi_reviews", MAX_LOAD = 100, PAGE_SIZE = 6, COOLDOWN_MS = 30000;
  var MAX_PHOTOS = 3, MAX_SIDE = 1000, MAX_CHARS = 240000, JPEG_PREFIX = "data:image/jpeg;base64,";
  var LIVE = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

  var $ = function (id) { return document.getElementById(id); };
  var form = $("reviewForm");
  if (!form) return;
  var list = $("rvList"), more = $("rvMore"), msg = $("rvMsg"), btn = $("rvSubmit"),
      counter = $("rvCount"), area = $("rvText"), box = $("rvStars");

  var STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";
  var COLORS = ["#1b2358", "#262f6e", "#131a45", "#8a6d2f", "#3a4488"];

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function stars(n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n)) || 0));
    var s = '<span class="stars" role="img" aria-label="' + n + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) {
      s += '<svg viewBox="0 0 24 24" class="' + (i <= n ? "on" : "") + '" aria-hidden="true"><path d="' + STAR + '"/></svg>';
    }
    return s + "</span>";
  }

  /* star picker */
  for (var v = 5; v >= 1; v--) {
    box.insertAdjacentHTML("beforeend",
      '<input type="radio" name="rating" id="st' + v + '" value="' + v + '">' +
      '<label for="st' + v + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR + '"/></svg>' +
      '<span class="sr">' + v + (v === 1 ? " star" : " stars") + "</span></label>");
  }

  /* ---------- storage ---------- */
  function demoStore() {
    var KEY = "da_demo_reviews_v1", cb = function () {};
    var day = 86400000, now = Date.now();
    var SAMPLES = []; /* no sample reviews: the list starts empty */
    function load() { try { return JSON.parse(safeGet(KEY) || "[]"); } catch (e) { return []; } }
    return {
      demo: true,
      subscribe: function (fn) { cb = fn; fn(load().concat(SAMPLES)); },
      add: function (r) {
        return new Promise(function (res) {
          var a = load(); r.createdAt = Date.now(); a.push(r);
          safeSet(KEY, JSON.stringify(a)); cb(a.concat(SAMPLES)); res();
        });
      }
    };
  }

  function liveStore() {
    var base = "https://www.gstatic.com/firebasejs/10.12.2/";
    return Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js")]).then(function (m) {
      var F = m[1], db = F.getFirestore(m[0].initializeApp(FIREBASE_CONFIG)), col = F.collection(db, COLLECTION);
      return {
        subscribe: function (fn, onErr) {
          F.onSnapshot(F.query(col, F.orderBy("createdAt", "desc"), F.limit(MAX_LOAD)), function (snap) {
            fn(snap.docs.map(function (d) {
              var x = d.data();
              return { name: x.name, car: x.car, rating: x.rating, text: x.text, images: x.images || [],
                       createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now() };
            }));
          }, onErr);
        },
        add: function (r) {
          return F.addDoc(col, { name: r.name, car: r.car, rating: r.rating, text: r.text, images: r.images || [], createdAt: F.serverTimestamp() });
        }
      };
    });
  }

  /* ---------- rendering ---------- */
  var items = [], shown = PAGE_SIZE, store = null;

  function avatarColor(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
  }
  function card(r) {
    var name = String(r.name || "Customer"), a = el("article", "rv-card");
    var head = el("div", "rv-head"), av = el("div", "rv-av", name.charAt(0).toUpperCase());
    av.style.background = avatarColor(name); av.setAttribute("aria-hidden", "true");
    var who = el("div", "rv-who"); who.appendChild(el("strong", null, name));
    if (r.car) who.appendChild(el("span", null, r.car));
    head.appendChild(av); head.appendChild(who);
    var st = el("div", "rv-stars"); st.innerHTML = stars(r.rating); head.appendChild(st);
    a.appendChild(head);
    a.appendChild(el("p", "rv-text", String(r.text || "")));
    var imgs = (r.images || []).filter(function (u) { return typeof u === "string" && u.indexOf(JPEG_PREFIX) === 0; });
    if (imgs.length) {
      var g = el("div", "rv-imgs");
      imgs.forEach(function (u, i) {
        var b = el("button"); b.type = "button"; b.setAttribute("aria-label", "View photo " + (i + 1) + " larger");
        var im = document.createElement("img"); im.src = u; im.alt = "Photo shared by " + name; im.loading = "lazy";
        b.appendChild(im); b.addEventListener("click", function () { lightbox(u, im.alt); }); g.appendChild(b);
      });
      a.appendChild(g);
    }
    var foot = el("div", "rv-foot");
    foot.appendChild(el("time", null, new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })));
    a.appendChild(foot);
    return a;
  }
  function render() {
    items.sort(function (a, b) { return b.createdAt - a.createdAt; });
    list.textContent = "";
    if (!items.length) {
      list.appendChild(el("div", "rv-empty", "No reviews yet. Be the first to share your visit."));
    } else {
      items.slice(0, shown).forEach(function (r) { list.appendChild(card(r)); });
    }
    more.hidden = items.length <= shown;
    var sum = 0; items.forEach(function (r) { sum += Number(r.rating) || 0; });
    var avg = items.length ? sum / items.length : 0;
    $("avg").textContent = items.length ? avg.toFixed(1) : "–";
    $("avgStars").innerHTML = items.length ? stars(avg) : "";
    $("cnt").textContent = items.length ? items.length + (items.length === 1 ? " review" : " reviews") : "No reviews yet";
  }
  more.addEventListener("click", function () { shown += PAGE_SIZE; render(); });

  /* ---------- photos ---------- */
  var photos = [], pending = 0, pick = $("rvPhotos"), prev = $("rvPrev");

  function lightbox(src, alt) {
    var o = el("div", "rv-lb"), im = document.createElement("img");
    im.src = src; im.alt = alt || ""; o.appendChild(im);
    function close() { o.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    o.addEventListener("click", close); document.addEventListener("keydown", onKey);
    document.body.appendChild(o);
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var side = MAX_SIDE, q = 0.78, out = "";
        for (var tries = 0; tries < 6; tries++) {
          var k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          var cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.naturalWidth * k));
          cv.height = Math.max(1, Math.round(img.naturalHeight * k));
          var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          out = cv.toDataURL("image/jpeg", q);
          if (out.length <= MAX_CHARS) return resolve(out);
          side = Math.round(side * 0.8); q = Math.max(0.5, q - 0.06);
        }
        reject(new Error("too large"));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }

  function drawPreviews() {
    prev.textContent = "";
    photos.forEach(function (u, i) {
      var d = el("div", "ph-item"), im = document.createElement("img");
      im.src = u; im.alt = "Selected photo " + (i + 1);
      var x = el("button", null, "×"); x.type = "button"; x.setAttribute("aria-label", "Remove photo " + (i + 1));
      x.addEventListener("click", function () { photos.splice(i, 1); drawPreviews(); });
      d.appendChild(im); d.appendChild(x); prev.appendChild(d);
    });
    $("rvAddPhoto").disabled = photos.length >= MAX_PHOTOS;
  }

  $("rvAddPhoto").addEventListener("click", function () { pick.click(); });
  pick.addEventListener("change", function () {
    var files = Array.prototype.slice.call(pick.files || []);
    pick.value = "";
    var room = MAX_PHOTOS - photos.length - pending;
    if (!files.length) return;
    if (files.length > room) say("You can add up to " + MAX_PHOTOS + " photos.");
    files.slice(0, Math.max(0, room)).forEach(function (f) {
      if (!/^image\//.test(f.type)) return say("Only image files can be added.");
      pending++;
      shrink(f).then(function (u) { photos.push(u); drawPreviews(); })
        .catch(function () { say("One photo could not be used. Please try a different one."); })
        .then(function () { pending--; });
    });
  });

  /* ---------- form ---------- */
  function say(text, ok) { msg.textContent = text; msg.className = "msg2" + (ok ? " ok" : " bad"); }
  area.addEventListener("input", function () { counter.textContent = area.value.length; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements["website"].value) return; /* spam trap */
    var name = $("rvName").value.trim(), car = $("rvCar").value.trim(), text = area.value.trim();
    var pick = form.querySelector('input[name="rating"]:checked');
    if (name.length < 2) return say("Please enter your name.");
    if (!pick) return say("Please choose a star rating.");
    if (text.length < 10) return say("Please write at least 10 characters.");
    if (Date.now() - Number(safeGet("da_last_review") || 0) < COOLDOWN_MS) return say("Please wait a few seconds before posting again.");
    if (pending) return say("Your photos are still being prepared. Please wait a moment.");
    if (!store) return say("Reviews are not available right now. Please try again later.");

    btn.disabled = true; btn.textContent = "Posting…"; msg.textContent = "";
    store.add({ name: name.slice(0, 60), car: car.slice(0, 80), rating: Number(pick.value), text: text.slice(0, 500), images: photos.slice() })
      .then(function () {
        safeSet("da_last_review", String(Date.now()));
        form.reset(); counter.textContent = "0"; photos = []; drawPreviews(); shown = Math.max(shown, PAGE_SIZE);
        say("Thank you! Your review is now on this page.", true);
        if (window.innerWidth <= 980) list.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function () { say("Could not post your review. Please try again."); })
      .then(function () { btn.disabled = false; btn.textContent = "Post my review"; });
  });

  /* ---------- start ---------- */
  function start(s) {
    store = s;
    if (s.demo) $("rvNote").hidden = false;
    s.subscribe(function (a) { items = a; render(); }, function () {
      list.textContent = ""; list.appendChild(el("div", "rv-empty", "Reviews could not be loaded right now."));
    });
  }
  if (LIVE) {
    liveStore().then(start).catch(function () {
      list.appendChild(el("div", "rv-empty", "Reviews could not be loaded right now."));
    });
  } else {
    start(demoStore());
  }
})();

/* ============================================================
   Flexicare Selfie v2 — capture with countdown + review/retake
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js and @barba/core.
   Pair with the "selfie overlay" embed (countdown + preview + CSS)
   dropped INSIDE [data-selfie-stage].

   FLOW
     live      → camera streaming, button = capture label, retake hidden
     counting  → tap capture → 3-2-1 overlay (camera still live)
     review    → frame captured + buffered; frozen preview shown,
                 retake button shown, button label → "Next"
     (retake)  → clears photo, back to live (stream kept alive)
     (next)    → barba.go() onward, photo already in Flexicare buffer

   The module sets data-selfie-state on <html> (single source for the
   embed CSS) and mirrors it onto the stage (local styling). Values:
     "starting" | "live" | "counting" | "review" | "error"

   REQUIRES https. Designer preview can't open a camera — test on the
   Published/Preview URL on a real device.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-selfie-stage]     REQUIRED. Circular preview box. JS injects
                             the <video>. position:relative, fixed size,
                             border-radius:50%, overflow:hidden. Drop the
                             overlay EMBED inside this element.
     [data-selfie-capture]   REQUIRED. Dual-purpose button ("That's me"
                             → "Next"). If an <a>, its href is the next
                             page; else add data-selfie-next.
     [data-selfie-retake]    Retake button. Just place it — CSS keeps it
                             hidden until review. Wired automatically.
     [data-selfie-next]      Next-page URL if the button isn't a link.
     [data-selfie-label]     Optional, INSIDE the capture button, on the
                             text element — safer label-swap target when
                             the button has nested markup.
     [data-selfie-error]     Optional hidden message box.
     [data-selfie-fallback]  Optional "upload instead" element (shown on
                             camera failure; opens a file picker).
   Attributes read for values:
     data-selfie-next-label   button, review label (default "Next")
     data-selfie-capture-label button, live label (default = its initial text)
     data-selfie-count        stage, countdown seconds (default cfg.countdown)

   Provided by the embed (inside the stage):
     [data-selfie-countdown]  the number overlay (JS fills 3/2/1)
     [data-selfie-preview]    <img> for the frozen captured shot (JS sets src)

   Config: Flexicare.config.selfie (see core) + .countdown seconds.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[selfie] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;
  var cfg = FC.config.selfie;
  if (cfg.countdown == null) cfg.countdown = 3; // seconds

  var state = {
    stage: null,
    video: null,
    stream: null,
    captureBtn: null,
    captureBtns: null,
    retakeBtn: null,
    fileInput: null,
    current: null, // last state we set
    countdownId: null,
    previewURL: null,
    captureLabelInitial: "That's me",
    busy: false,
  };

  /* --------------------------- dom helpers --------------------------- */

  function descendant(sel) {
    return (
      (state.stage && state.stage.querySelector(sel)) ||
      document.querySelector(sel)
    );
  }
  function findIn(scope, sel) {
    return (scope || document).querySelector(sel);
  }

  function setState(s) {
    state.current = s;
    document.documentElement.setAttribute("data-selfie-state", s);
    if (state.stage) state.stage.setAttribute("data-selfie-state", s);
  }
  function clearStateAttr() {
    document.documentElement.removeAttribute("data-selfie-state");
  }

  function showError(msg) {
    setState("error");
    var box = descendant("[data-selfie-error]");
    if (box) {
      box.textContent = msg;
      box.style.display = "";
      box.removeAttribute("hidden");
    }
    var fb = document.querySelector("[data-selfie-fallback]");
    if (fb) {
      fb.style.display = "";
      fb.removeAttribute("hidden");
    }
  }

  function labelTarget() {
    var btn = state.captureBtn;
    if (!btn) return null;
    return btn.querySelector("[data-selfie-label]") || btn;
  }
  function setLabel(which) {
    var t = labelTarget();
    if (!t) return;
    var btn = state.captureBtn;
    var cap =
      btn.getAttribute("data-selfie-capture-label") ||
      state.captureLabelInitial;
    var nxt = btn.getAttribute("data-selfie-next-label") || "Next";
    t.textContent = which === "next" ? nxt : cap;
  }

  /* --------------------------- image ops --------------------------- */

  function toJpegBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(
          function (b) {
            b ? resolve(b) : reject(new Error("toBlob null"));
          },
          "image/jpeg",
          cfg.quality
        );
      } else {
        try {
          var url = canvas.toDataURL("image/jpeg", cfg.quality);
          var bin = atob(url.split(",")[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/jpeg" }));
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  function squareDownscale(source, sw, sh, mirrored) {
    var side = Math.min(sw, sh);
    var sx = (sw - side) / 2;
    var sy = (sh - side) / 2;
    var out = Math.min(side, cfg.maxSize);
    var c = document.createElement("canvas");
    c.width = out;
    c.height = out;
    var ctx = c.getContext("2d");
    if (mirrored) {
      ctx.translate(out, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, sx, sy, side, side, 0, 0, out, out);
    return toJpegBlob(c);
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(
        function () {
          return createImageBitmap(file);
        }
      );
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function (e) {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  /* --------------------------- camera --------------------------- */

  function startCamera() {
    setState("starting");
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showError(
        "Camera needs a secure (https) page. Open the published site on your phone, or upload a photo instead."
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: cfg.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      })
      .then(function (stream) {
        state.stream = stream;
        var v = state.video;
        if (!v) {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        v.srcObject = stream;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
        setState("live");
        setLabel("capture");
      })
      .catch(function (err) {
        var name = err && err.name;
        if (name === "NotAllowedError" || name === "SecurityError")
          showError(
            "Camera access was blocked. Allow it in your browser, or upload a photo instead."
          );
        else if (name === "NotFoundError" || name === "OverconstrainedError")
          showError("No camera found. You can upload a photo instead.");
        else
          showError(
            "Couldn't start the camera. You can upload a photo instead."
          );
      });
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) {
        t.stop();
      });
      state.stream = null;
    }
    if (state.video) {
      try {
        state.video.srcObject = null;
      } catch (e) {}
    }
  }

  /* ------------------------ countdown + capture ------------------------ */

  function clearCountdown() {
    if (state.countdownId) {
      clearInterval(state.countdownId);
      state.countdownId = null;
    }
  }

  function tickPop(cd) {
    if (!cd) return;
    cd.classList.remove("fc-pop");
    void cd.offsetWidth; // reflow to restart the animation
    cd.classList.add("fc-pop");
  }

  function cameraLive() {
    return !!(
      state.stream &&
      state.video &&
      state.video.videoWidth &&
      state.video.videoHeight
    );
  }

  function beginCountdown(btn) {
    if (!cameraLive()) {
      openFilePicker(nextUrl(btn)); // no live camera → file path
      return;
    }
    var start = parseInt(
      state.stage && state.stage.getAttribute("data-selfie-count"),
      10
    );
    if (!start || start < 1) start = cfg.countdown || 3;

    var cd = descendant("[data-selfie-countdown]");
    var remaining = start;
    setState("counting");
    if (cd) {
      cd.textContent = String(remaining);
      tickPop(cd);
    }
    clearCountdown();
    state.countdownId = setInterval(function () {
      remaining -= 1;
      if (remaining > 0) {
        if (cd) {
          cd.textContent = String(remaining);
          tickPop(cd);
        }
      } else {
        clearCountdown();
        capture(btn);
      }
    }, 1000);
  }

  function capture(btn) {
    if (!cameraLive()) {
      openFilePicker(nextUrl(btn));
      return;
    }
    state.busy = true;
    var v = state.video;
    squareDownscale(v, v.videoWidth, v.videoHeight, cfg.captureMirrored)
      .then(function (blob) {
        FC.setPhoto(blob, "image/jpeg");
        showReview(blob);
        state.busy = false;
      })
      .catch(function () {
        state.busy = false;
        setState("live");
        showError("Couldn't capture the photo — please try again.");
      });
  }

  function showReview(blob) {
    var img = descendant("[data-selfie-preview]");
    if (img) {
      if (state.previewURL) URL.revokeObjectURL(state.previewURL);
      state.previewURL = URL.createObjectURL(blob);
      img.src = state.previewURL;
    }
    setLabel("next");
    setState("review");
  }

  function retake() {
    if (state.previewURL) {
      URL.revokeObjectURL(state.previewURL);
      state.previewURL = null;
    }
    var img = descendant("[data-selfie-preview]");
    if (img) img.removeAttribute("src");
    FC.clearPhoto();
    setLabel("capture");
    if (cameraLive()) setState("live");
    else startCamera(); // stream lost somehow → restart
  }

  /* ------------------------ navigation ------------------------ */

  function realHref(el) {
    var h = el && el.getAttribute("href");
    // Webflow gives Link Blocks a default href="#" when no real link is set —
    // treat that (and an empty href) as "no link", not a destination.
    return h && h !== "#" ? h : null;
  }

  function nextUrl(btn) {
    return (
      (btn && (btn.getAttribute("data-selfie-next") || realHref(btn))) ||
      (state.captureBtn &&
        (state.captureBtn.getAttribute("data-selfie-next") ||
          realHref(state.captureBtn))) ||
      (state.stage && state.stage.getAttribute("data-selfie-next")) ||
      null
    );
  }

  function goNext(url) {
    clearCountdown();
    stopCamera();
    if (!url) {
      console.warn("[selfie] no next URL set (href or data-selfie-next).");
      return;
    }
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url; // NOTE: reload drops the in-memory photo
  }

  /* ------------------------ button handling ------------------------ */

  function onCaptureButton(e) {
    if (e) e.preventDefault();
    if (state.busy) return;
    var st = state.current;
    if (st === "review") {
      goNext(nextUrl(e ? e.currentTarget : null));
    } else if (st === "counting") {
      // ignore taps mid-countdown
    } else {
      beginCountdown(e ? e.currentTarget : state.captureBtn);
    }
  }

  function onRetake(e) {
    if (e) e.preventDefault();
    if (state.current === "review") retake();
  }

  /* -------------------------- file fallback -------------------------- */

  function ensureFileInput() {
    if (state.fileInput) return state.fileInput;
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("capture", "user");
    input.style.cssText =
      "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(input);
    state.fileInput = input;
    return input;
  }

  function openFilePicker(url) {
    var input = ensureFileInput();
    input.onchange = function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file || state.busy) return;
      state.busy = true;
      loadBitmap(file)
        .then(function (src) {
          return squareDownscale(
            src,
            src.width || src.videoWidth,
            src.height || src.videoHeight,
            false
          );
        })
        .then(function (blob) {
          FC.setPhoto(blob, "image/jpeg");
          showReview(blob); // review the uploaded shot too
          state.busy = false;
        })
        .catch(function () {
          state.busy = false;
          showError("Couldn't read that image — please try another.");
        });
    };
    input.click();
  }

  /* ------------------------ delegated click handling ------------------------
       ONE listener on document, registered once for the life of the page. It
       re-resolves the target by attribute at the moment of the click (closest),
       rather than trusting a button reference captured at init time. This is
       immune to: which Barba hook init() ran on, any DOM rebuild of the button
       by another script, and stale/duplicate references — there is nothing to
       go stale, because nothing is stored. */
  function onDocumentClick(e) {
    if (!e.target || typeof e.target.closest !== "function") return;

    var capBtn = e.target.closest("[data-selfie-capture]");
    if (capBtn) {
      e.preventDefault();
      if (!state.stage) return; // selfie page not active
      onCaptureButton({
        currentTarget: capBtn,
        preventDefault: function () {},
      });
      return;
    }
    var retakeBtn = e.target.closest("[data-selfie-retake]");
    if (retakeBtn) {
      e.preventDefault();
      if (!state.stage) return;
      onRetake({ currentTarget: retakeBtn, preventDefault: function () {} });
      return;
    }
    var fbBtn = e.target.closest("[data-selfie-fallback]");
    if (fbBtn) {
      e.preventDefault();
      if (!state.stage) return;
      openFilePicker(nextUrl(document.querySelector("[data-selfie-capture]")));
    }
  }
  document.addEventListener("click", onDocumentClick);

  /* ------------------------- init / teardown ------------------------- */

  function init(scope) {
    var scopeEl = scope || document;
    var stage = findIn(scopeEl, "[data-selfie-stage]");
    if (!stage) return; // not the selfie page
    if (state.stage === stage) return; // already initialised
    teardown();
    state.stage = stage;
    state.busy = false;

    if (getComputedStyle(stage).position === "static")
      stage.style.position = "relative";

    var v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("autoplay", "");
    v.muted = true;
    v.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0;";
    if (cfg.mirrorPreview) v.style.transform = "scaleX(-1)";
    stage.insertBefore(v, stage.firstChild);
    state.video = v;

    var btns = scopeEl.querySelectorAll("[data-selfie-capture]");
    state.captureBtns = btns;
    state.captureBtn = btns[0] || null;
    if (state.captureBtn) {
      var t = labelTarget();
      state.captureLabelInitial =
        state.captureBtn.getAttribute("data-selfie-capture-label") ||
        (t && (t.textContent || "").trim()) ||
        "That's me";
    }
    // NOTE: click handling is NOT attached here — see the single delegated
    // document listener below. Attaching directly to these specific nodes
    // was unreliable on real Barba navigations (worked after a refresh, not
    // after navigating in); delegation sidesteps whatever node/lifecycle
    // mismatch caused that, since it re-resolves the target by attribute at
    // the moment of the click rather than trusting a stored reference.

    setLabel("capture");
    startCamera();
  }

  function teardown() {
    clearCountdown();
    stopCamera();
    if (state.previewURL) {
      URL.revokeObjectURL(state.previewURL);
      state.previewURL = null;
    }
    if (state.video && state.video.parentNode)
      state.video.parentNode.removeChild(state.video);
    clearStateAttr();
    state.stage = null;
    state.video = null;
    state.captureBtn = null;
    state.captureBtns = null;
    state.current = null;
    state.busy = false;
  }

  /* ---------------------------- lifecycle ---------------------------- */

  if (window.barba && window.barba.hooks) {
    // afterEnter (not enter): transition.js's own afterEnter hook calls
    // LiquidGlass.scan(), which can rebuild the capture/retake buttons for the
    // glass effect. Because hooks fire in script load order and transition.js
    // loads first, its scan() always runs before this — so by the time we
    // attach click listeners here, the buttons are final and won't be pulled
    // out from under us. (This was the "works after refresh, not on natural
    // navigation" bug: refresh runs boot() after the page's initial scan has
    // already settled; navigation was attaching before the post-nav scan.)
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function (data) {
      var scope = data && data.current && data.current.container;
      if (!scope || findIn(scope, "[data-selfie-stage]") || state.stage)
        teardown();
    });
  }
  window.addEventListener("pagehide", teardown);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  FC.selfie = { init: init, teardown: teardown, retake: retake };
})();

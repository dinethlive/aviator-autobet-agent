// ==UserScript==
// @name         aviator-autobet-agent
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automated Betting & Cashout exploiting V8 Network API, V9 Angular Memory, and PING_RESPONSE a:13 anomalies.
// @author       Dineth Pramodya
// @match        *://*/*/aviator*
// @match        *://*.spribegaming.com/*
// @match        https://melbet-srilanka.com/games-frame/games/*
// @match        https://*.melbet*.com/games-frame/games/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // ===================== EXPLOIT: V7 EVENT LISTENER HIJACK =====================
  // Steals Angular's internal click handlers before they check e.isTrusted
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === "click" || type === "pointerdown" || type === "touchstart") {
      if (!this.__av_listeners)
        Object.defineProperty(this, "__av_listeners", {
          value: {},
          enumerable: false,
          writable: true,
        });
      if (!this.__av_listeners[type]) this.__av_listeners[type] = [];
      this.__av_listeners[type].push(listener);
    }
    return origAddEventListener.apply(this, arguments);
  };

  // ===================== AGENT STATE =====================
  const A = {
    armed: false,
    skipMode: "1-3", // '1-3', '4-5', '6-10'
    amountMode: "stable20", // 'stable20', 'random4060100', 'martingale'
    cashoutMode: "1.10-1.20",

    martingaleStartLosses: 3,
    maxMartingaleSteps: 8,
    consecutiveLosses: parseInt(sessionStorage.getItem("avAgent_losses")) || 0,

    targetSkip: 0,
    currentSkip: 0,
    targetMultiplier: 0,
    betState: "idle", // 'idle', 'bet_placed', 'flying', 'cashed_out'
    currentBetAmount: 0,

    sessionParams: {
      cashoutUrl: null,
      cashoutHeaders: null,
      lastCashoutBody: null,
      betUrl: null,
      betHeaders: null,
      lastBetBody: null,
      token: null,
    },

    // Network / Payload Capture
    ws: null,
    lastBetPayload: null,
    lastCashoutPayload: null,

    domCache: {
      bet: [],
      cashout: [],
    },

    // Human Emulation Hardware Tracker
    mouse: { x: 0, y: 0 },
  };

  // Keep track of the real physical mouse cursor
  window.addEventListener(
    "mousemove",
    (e) => {
      A.mouse.x = e.clientX;
      A.mouse.y = e.clientY;
    },
    { passive: true },
  );

  // Helper: Select random int
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Helper: Select random float
  function getRandomFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
  }

  function generateNextTargetSkip() {
    if (A.skipMode === "1-3") A.targetSkip = getRandomInt(1, 3);
    else if (A.skipMode === "4-5") A.targetSkip = getRandomInt(4, 5);
    else if (A.skipMode === "6-10") A.targetSkip = getRandomInt(6, 10);
    logAgent(`Next bet will trigger after skipping ${A.targetSkip} rounds.`);
  }

  function generateNextTargetMultiplier() {
    if (A.cashoutMode === "1.10-1.20")
      A.targetMultiplier = parseFloat(getRandomFloat(1.1, 1.2));
    else if (A.cashoutMode === "1.50-1.98")
      A.targetMultiplier = parseFloat(getRandomFloat(1.5, 1.98));
    else if (A.cashoutMode === "2.00-2.97")
      A.targetMultiplier = parseFloat(getRandomFloat(2.0, 2.97));
    logAgent(
      `Target Cashout Multiplier Generated: ${A.targetMultiplier}x`,
      "#ffff00",
    );
  }

  // ===================== EXPLOIT: V9 MEMORY PROBE =====================
  // Rips the Angular/Vue Component out of RAM to execute functions directly
  function v9MemoryProbe(btnElements, validMethods, actionName) {
    const targets = btnElements.filter((b) => document.body.contains(b));
    let executed = false;

    // 1. EXPLOIT: HUMAN EMULATION (Primary Attack Vector)
    // If the user's mouse is actively resting over the button, fire a mathematically perfect hardware click at those physical coordinates.
    if (!executed && A.mouse.x > 0 && A.mouse.y > 0) {
      logAgent(
        `[HUMAN EMULATION] Firing Synthetic Hardware Click at Physical POS (${A.mouse.x}, ${A.mouse.y})...`,
        "#11ff11",
        true,
      );
      targets.forEach((b) => {
        try {
          const rect = b.getBoundingClientRect();
          // Optional sanity check: Only fire if mouse is roughly inside the game iframe boundaries, else fallback
          if (
            A.mouse.x >= rect.left &&
            A.mouse.x <= rect.right &&
            A.mouse.y >= rect.top &&
            A.mouse.y <= rect.bottom
          ) {
            const events = [
              "pointerdown",
              "mousedown",
              "pointerup",
              "mouseup",
              "click",
            ];
            events.forEach((eType) => {
              b.dispatchEvent(
                new MouseEvent(eType, {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1,
                  composed: true,
                  clientX: A.mouse.x,
                  clientY: A.mouse.y,
                  screenX: A.mouse.x,
                  screenY: A.mouse.y,
                }),
              );
            });
            b.click();
            executed = true;
          }
        } catch (e) {}
      });
    }

    // 2. EXPLOIT: V9 MEMORY PROBE
    // Rips the Angular/Vue Component out of RAM to execute functions directly if Emulation fails

    targets.forEach((btn) => {
      // Spribe Angular structures often bind the components to inner spans or labels instead of the root button.
      // We assemble an array of the button itself, its parent hierarchy, and EVERY descendant node to brute-force the context.
      let nodesToSearch = [btn];
      if (btn.parentElement) {
        nodesToSearch.push(btn.parentElement);
        if (btn.parentElement.parentElement)
          nodesToSearch.push(btn.parentElement.parentElement);
      }
      nodesToSearch.push(...Array.from(btn.querySelectorAll("*")));

      for (let node of nodesToSearch) {
        if (!node || executed) continue;
        const keys = Object.keys(node).concat(Object.getOwnPropertyNames(node));

        for (let k of keys) {
          if (
            k.startsWith("__react") ||
            k.startsWith("__ngContext__") ||
            k === "__vue__"
          ) {
            let comp = node[k];
            if (comp) {
              // Angular 9+ stores context as an LView array. If array, search its interior elements.
              let compsToScan = Array.isArray(comp)
                ? comp.filter((c) => c && typeof c === "object")
                : [comp];

              for (let c of compsToScan) {
                let current = c;
                for (let depth = 0; depth < 8; depth++) {
                  if (!current) break;
                  let methods = Object.getOwnPropertyNames(current).concat(
                    Object.keys(current),
                  );
                  for (let method of methods) {
                    if (
                      typeof current[method] === "function" &&
                      validMethods.some((v) => method.toLowerCase().includes(v))
                    ) {
                      logAgent(
                        `[V9 MEMORY] Target Locked: -> ${method}() Forcing Execution!`,
                        "#ff2a2a",
                      );
                      try {
                        current[method]();
                        executed = true;
                      } catch (e) {}
                    }
                  }
                  current =
                    current.return ||
                    current.$parent ||
                    current.parent ||
                    current._parentVnode ||
                    (current.memoizedState
                      ? current.memoizedState.element
                      : null) ||
                    (Array.isArray(current) ? current[0] : null);
                }
              }
            }
          }
        }
      }
    });

    // V8 API Fallback if V9 Fails
    if (!executed) {
      logAgent(
        `[V9 FAILED] Falling back to V8 API Push for ${actionName}`,
        "#ffaa00",
      );
      if (
        actionName === "bet" &&
        A.sessionParams.betUrl &&
        A.sessionParams.betHeaders
      ) {
        try {
          fetch(A.sessionParams.betUrl, {
            method: "POST",
            headers: A.sessionParams.betHeaders,
            body: A.sessionParams.lastBetBody,
          });
          executed = true;
          logAgent(`[V8 API] Replayed encrypted Bet payload.`, "#4cff4c");
        } catch (e) {}
      } else if (
        actionName === "cashout" &&
        A.sessionParams.cashoutUrl &&
        A.sessionParams.cashoutHeaders
      ) {
        try {
          fetch(A.sessionParams.cashoutUrl, {
            method: "POST",
            headers: A.sessionParams.cashoutHeaders,
            body: A.sessionParams.lastCashoutBody,
          });
          executed = true;
          logAgent(`[V8 API] Replayed encrypted Cashout payload.`, "#4cff4c");
        } catch (e) {}
      }
    }

    // V7 Stolen Listener Execution (Bypasses isTrusted checks perfectly)
    if (!executed) {
      logAgent(`[V7 HIJACK] Executing Stolen Event Listeners...`, "#ff00ff");
      targets.forEach((btn) => {
        let nodesToSearch = [btn];
        if (btn.parentElement) nodesToSearch.push(btn.parentElement);
        nodesToSearch.push(...Array.from(btn.querySelectorAll("*")));

        nodesToSearch.forEach((node) => {
          if (node && node.__av_listeners) {
            ["click", "pointerdown", "touchstart"].forEach((type) => {
              if (node.__av_listeners[type]) {
                node.__av_listeners[type].forEach((listener) => {
                  try {
                    // Create a synthetic event object that looks perfectly real
                    let fakeEvent = {
                      type: type,
                      isTrusted: true,
                      target: node,
                      currentTarget: node,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      stopImmediatePropagation: () => {},
                    };
                    if (typeof listener === "function") {
                      listener(fakeEvent);
                      executed = true;
                    } else if (
                      listener &&
                      typeof listener.handleEvent === "function"
                    ) {
                      listener.handleEvent(fakeEvent);
                      executed = true;
                    }
                  } catch (e) {}
                });
              }
            });
          }
        });
      });
    }
  }

  // ===================== AGENT ACTIONS (0-Lat Direct WS Injection) =====================
  async function executeAgentBet() {
    if (!A.armed) return;

    // Determine Amount
    if (A.amountMode === "stable20") {
      A.currentBetAmount = 20;
    } else if (A.amountMode === "random4060100") {
      A.currentBetAmount = [40, 60, 100][Math.floor(Math.random() * 3)];
    } else if (A.amountMode === "martingale") {
      if (A.consecutiveLosses < A.martingaleStartLosses) {
        A.currentBetAmount = 20; // Base bet during the allowed loss grace period
      } else {
        let stepsIntoMg = A.consecutiveLosses - A.martingaleStartLosses + 1;
        if (stepsIntoMg > A.maxMartingaleSteps) {
          logAgent(
            `[MARTINGALE SAFEGUARD] Max steps (${A.maxMartingaleSteps}) breached! Resetting sequence to 20.`,
            "#ff4444",
            true,
          );
          A.consecutiveLosses = 0;
          sessionStorage.setItem("avAgent_losses", 0);
          A.currentBetAmount = 20;
        } else {
          // Start multiplying base 20. Step 1 = 40, Step 2 = 80, Step 3 = 160...
          A.currentBetAmount = 20 * Math.pow(2, stepsIntoMg);
          logAgent(
            `[MARTINGALE] Consecutive Losses: ${A.consecutiveLosses} -> Escalating Bet to ${A.currentBetAmount}`,
            "#ff00ff",
            true,
          );
        }
      }
    }

    logAgent(
      `[WEAPON] Injecting Native WebSocket Bet... Amount: ${A.currentBetAmount}`,
      "#00f",
    );

    // Dynamic Input Injection: Spribe binds the amount to an input[inputmode="decimal"]
    document.querySelectorAll('input[inputmode="decimal"]').forEach((inp) => {
      try {
        inp.value = A.currentBetAmount.toFixed(2);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {}
    });

    // Yield thread so Angular/Vue digest cycle can physically register the DOM amount change
    await new Promise((r) => setTimeout(r, 150));

    // 1. Direct Native WebSocket Injection (God Mode)
    if (A.ws && A.ws.readyState === WebSocket.OPEN && A.lastBetPayload) {
      try {
        // Hack the captured payload string to inject the exact amount expected by the backend (e.g., 20.00)
        let payloadToSend = A.lastBetPayload;
        // Spribe bet strings look like: {"c":"bet","amount":20.00,"...
        payloadToSend = payloadToSend.replace(
          /(["']?amount["']?\s*:\s*)\d+(\.\d+)?/,
          `$1${A.currentBetAmount.toFixed(2)}`,
        );

        A.ws.send(payloadToSend);
        logAgent(
          `[WS INJECT] Successfully fired native WS bet string!`,
          "#4cff4c",
          true,
        );
      } catch (e) {
        logAgent(
          `[WS FAILED] Native transport failed, falling back to Memory...`,
          "#ffaa00",
        );
        v9MemoryProbe(A.domCache.bet, ["bet", "place"], "bet");
      }
    } else {
      // 2. V9/V8/V7 DOM Fallback stack if WS payload hasn't been captured yet
      v9MemoryProbe(A.domCache.bet, ["bet", "place"], "bet");
    }

    A.betState = "bet_placed";
    updateLogEl();
  }

  function executeAgentCashout() {
    if (!A.armed || A.betState !== "flying") return;

    logAgent(
      `[WEAPON] ⚠️ TARGET MULTIPLIER ${A.targetMultiplier}x REACHED! INJECTING CASHOUT!`,
      "#ff0000",
      true,
    );

    // 1. Direct Native WebSocket Injection
    if (A.ws && A.ws.readyState === WebSocket.OPEN && A.lastCashoutPayload) {
      try {
        A.ws.send(A.lastCashoutPayload);
        logAgent(
          `[WS INJECT] Fired native WS cashout string!`,
          "#4cff4c",
          true,
        );
      } catch (e) {
        v9MemoryProbe(
          A.domCache.cashout,
          ["cash", "withdraw", "collect"],
          "cashout",
        );
      }
    } else {
      v9MemoryProbe(
        A.domCache.cashout,
        ["cash", "withdraw", "collect"],
        "cashout",
      );
    }

    A.betState = "cashed_out"; // Flag for win tracking
    updateLogEl();
  }

  // ===================== SFS BINARY TO JSON ENGINE =====================
  async function decompressBuffer(buffer) {
    try {
      let bytes = new Uint8Array(buffer);
      if (bytes.length > 2 && bytes[0] === 0x78) {
        const ds = new DecompressionStream("deflate");
        const stream = new Response(buffer).body.pipeThrough(ds);
        return await new Response(stream).arrayBuffer();
      }
    } catch (e) {}
    return buffer;
  }

  function parseSfsType(bytes, view, offsetRef, type) {
    if (offsetRef.val >= bytes.length) return null;
    try {
      switch (type) {
        case 0:
          return null;
        case 1:
          return !!bytes[offsetRef.val++];
        case 2:
          return bytes[offsetRef.val++];
        case 3: {
          let v = view.getInt16(offsetRef.val, false);
          offsetRef.val += 2;
          return v;
        }
        case 4: {
          let v = view.getInt32(offsetRef.val, false);
          offsetRef.val += 4;
          return v;
        }
        case 5: {
          let v = Number(view.getBigInt64(offsetRef.val, false));
          offsetRef.val += 8;
          return v;
        }
        case 6: {
          let v = view.getFloat32(offsetRef.val, false);
          offsetRef.val += 4;
          return v;
        }
        case 7: {
          let v = view.getFloat64(offsetRef.val, false);
          offsetRef.val += 8;
          return v;
        }
        case 8: {
          if (offsetRef.val + 2 > bytes.length) return null;
          let len = view.getInt16(offsetRef.val, false);
          offsetRef.val += 2;
          let str = "";
          for (let i = 0; i < len; i++)
            str += String.fromCharCode(bytes[offsetRef.val++]);
          return str;
        }
        case 17: {
          // SFSArray
          if (offsetRef.val + 2 > bytes.length) return [];
          let size = view.getInt16(offsetRef.val, false);
          offsetRef.val += 2;
          let arr = [];
          for (let i = 0; i < size; i++) {
            if (offsetRef.val >= bytes.length) break;
            let t = bytes[offsetRef.val++];
            arr.push(parseSfsType(bytes, view, offsetRef, t));
          }
          return arr;
        }
        case 18: {
          // SFSObject
          if (offsetRef.val + 2 > bytes.length) return {};
          let size = view.getInt16(offsetRef.val, false);
          offsetRef.val += 2;
          let obj = {};
          for (let i = 0; i < size; i++) {
            if (offsetRef.val + 2 > bytes.length) break;
            let len = view.getInt16(offsetRef.val, false);
            offsetRef.val += 2;
            let k = "";
            for (let j = 0; j < len; j++)
              k += String.fromCharCode(bytes[offsetRef.val++]);
            if (offsetRef.val >= bytes.length) break;
            let t = bytes[offsetRef.val++];
            obj[k] = parseSfsType(bytes, view, offsetRef, t);
          }
          return obj;
        }
        default:
          return null;
      }
    } catch (e) {
      return null;
    }
  }

  function extractSFSObjects(buffer) {
    let view = new DataView(buffer);
    let bytes = new Uint8Array(buffer);
    let extracted = {};
    for (let i = 0; i < bytes.length - 5; i++) {
      let len = (bytes[i] << 8) | bytes[i + 1];
      if (len > 0 && len < 30) {
        let isValid = true;
        let key = "";
        for (let j = 0; j < len; j++) {
          let c = bytes[i + 2 + j];
          if (c < 32 || c > 126) {
            isValid = false;
            break;
          }
          key += String.fromCharCode(c);
        }
        if (isValid) {
          let typeIdx = i + 2 + len;
          if (typeIdx < bytes.length) {
            let type = bytes[typeIdx];
            if (type >= 0 && type <= 18) {
              let offsetRef = { val: typeIdx + 1 };
              let val = parseSfsType(bytes, view, offsetRef, type);
              if (val !== null && typeof val !== "undefined")
                extracted[key] = val;
            }
          }
        }
      }
    }
    return extracted;
  }

  // ===================== WEBSOCKET MITM / GAME LOGIC =====================
  const OrigWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = new OrigWS(url, protocols);
    A.ws = ws; // Store reference for native injection

    // Hook incoming data to monitor game state & anomalies
    ws.addEventListener("message", async (e) => {
      try {
        let parsedObj = null;

        // 1. Decrypt Binary Payloads
        if (e.data instanceof ArrayBuffer || e.data instanceof Blob) {
          let buffer =
            e.data instanceof Blob ? await e.data.arrayBuffer() : e.data;
          let decompressed = await decompressBuffer(buffer);
          parsedObj = extractSFSObjects(decompressed);
        } else if (typeof e.data === "string") {
          try {
            parsedObj = JSON.parse(e.data);
          } catch (err) {}
        }

        if (!parsedObj) return;

        // Track Game States
        if (
          parsedObj.c === "changeState" &&
          parsedObj.newStateId !== undefined
        ) {
          handleGameState(parsedObj.newStateId);
        }

        // Steal Tokens just in case
        if (parsedObj.c === "login" && parsedObj.p && parsedObj.p.token) {
          A.sessionParams.token = parsedObj.p.token;
        }

        // 2. MONEY MANAGEMENT CASHOUT TRIGGER
        if (
          A.armed &&
          (A.betState === "flying" || A.betState === "bet_placed")
        ) {
          const scanEl = document.getElementById("av-scan-status");

          if (parsedObj.c === "x" && parsedObj.x !== undefined) {
            // If backend missed stateId 2, force transition to flying immediately upon live multiplier reception
            if (A.betState === "bet_placed") {
              A.betState = "flying";
              updateLogEl();
            }

            let currentMult = parseFloat(parsedObj.x);
            if (scanEl)
              scanEl.textContent = `[FLIGHT] Current: ${currentMult.toFixed(2)}x | Target: ${A.targetMultiplier}x`;

            if (currentMult >= A.targetMultiplier) {
              if (scanEl) {
                scanEl.textContent = `[TARGET MATCHED] Extracting at ${A.targetMultiplier}x!`;
                scanEl.style.color = "#ff0000";
              }
              executeAgentCashout();
            }
          }

          // 3. EXPLICIT LOSS TRACKER: "crashX" Mutation
          // If the backend broadcasts the explicit 'crashX' payload, and we are still actively holding a bet,
          // we mathematically verify we lost this round before achieving our target cashout.
          if (parsedObj.crashX !== undefined) {
            A.consecutiveLosses++;
            sessionStorage.setItem("avAgent_losses", A.consecutiveLosses);
            logAgent(
              `🔴 [LOSS] 'crashX' payload intercepted! Bet lost. Consecutive Losses: ${A.consecutiveLosses}`,
              "#ff4444",
            );
            A.betState = "idle";
            updateLogEl();
          }
        }
      } catch (err) {}
    });

    // Hook OUTGOING data to steal the exact user's Bet / Cashout signature strings
    const origSend = ws.send;
    ws.send = function (data) {
      try {
        if (typeof data === "string") {
          let req = JSON.parse(data);

          if (req.p && req.p.c === "bet") {
            A.lastBetPayload = data;
            if (A.armed) {
              A.betState = "bet_placed";
              updateLogEl();
            }
            logAgent(
              `[STEALER] Captured exact Native WS Bet Payload!`,
              "#00ffcc",
            );
          } else if (req.p && req.p.c === "cancel") {
            if (A.armed && A.betState === "bet_placed") {
              A.betState = "idle";
              updateLogEl();
            }
            logAgent(`[STEALER] Captured WS Cancel Payload!`, "#ffaa00");
          } else if (req.p && req.p.c === "cashOut") {
            A.lastCashoutPayload = data;
            if (A.armed) {
              if (A.consecutiveLosses > 0)
                logAgent(
                  `🟢 [WIN] Target Extracted. Martingale reset to 0!`,
                  "#4cff4c",
                );
              A.betState = "cashed_out";
              A.consecutiveLosses = 0;
              sessionStorage.setItem("avAgent_losses", 0);
              updateLogEl();
            }
            logAgent(
              `[STEALER] Captured exact Native WS Cashout Payload!`,
              "#00ffcc",
            );
          }
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };

    return ws;
  };

  // Global function to call from SFS parser if we hook into the binary packets
  window._avAgentSetState = function (stateId) {
    handleGameState(stateId);
  };

  function handleGameState(stateId) {
    if (stateId === 1) {
      // Betting Phase Open
      if (!A.armed) return;
      A.betState = "idle";
      A.currentSkip++;

      if (A.currentSkip >= A.targetSkip) {
        logAgent(`Skip target reached (${A.targetSkip}). Firing Autombot...`);
        executeAgentBet();
        A.currentSkip = 0;
        generateNextTargetSkip();
      } else {
        logAgent(
          `Skipping round. (Skipped ${A.currentSkip} / ${A.targetSkip})`,
        );
      }
      // Generate the multi-target for the coming round if we placed a bet or are just running generally
      generateNextTargetMultiplier();
      updateLogEl();
    } else if (stateId === 2) {
      // Flight Started
      if (A.betState === "bet_placed") {
        A.betState = "flying";
        logAgent(
          `Flight Started. Awaiting Money Target (${A.targetMultiplier}x)...`,
          "#0ff",
        );
        updateLogEl();
      }
    } else if (stateId === 3) {
      // Flight Ended (Crash)
      if (!A.armed) return;

      // Only track explicit wins or skipped rounds here now.
      // Losses are handled universally via the highly-accurate 'crashX' payload scanner in the WS hook.

      if (A.betState === "cashed_out") {
        logAgent(
          `✅ Round finished. Bag correctly secured prior to crash.`,
          "#4cff4c",
        );
      } else if (A.betState === "idle") {
        logAgent(
          `⚪ [SKIPPED ROUND CRASH] No active bet. Tracker ignored.`,
          "#888",
        );
      }

      // We INTENTIONALLY DO NOT reset A.betState to 'idle' here if it is 'flying'.
      // The crashX WebSocket payload (which arrives asynchronously) strictly needs the agent
      // to be structurally 'flying' to count as a verified active loss.
      updateLogEl();
    }
  }

  // ===================== EXPLOIT: V8 FETCH/XHR NETWORK HOOK =====================
  const origFetch = window.fetch;
  window.fetch = function () {
    try {
      let url = arguments[0];
      if (typeof url === "string") {
        if (url.toLowerCase().includes("cashout")) {
          A.sessionParams.cashoutUrl = url;
          if (arguments[1]) {
            A.sessionParams.cashoutHeaders = arguments[1].headers;
            A.sessionParams.lastCashoutBody = arguments[1].body;
          }
        } else if (url.toLowerCase().includes("bet")) {
          A.sessionParams.betUrl = url;
          if (arguments[1]) {
            A.sessionParams.betHeaders = arguments[1].headers;
            A.sessionParams.lastBetBody = arguments[1].body;
          }
        }
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSendXHR = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.__av_url = url;
    } catch (e) {}
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    try {
      if (!this.__av_headers) this.__av_headers = {};
      this.__av_headers[header] = value;
    } catch (e) {}
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__av_url && typeof this.__av_url === "string") {
        let url = this.__av_url.toLowerCase();
        if (url.includes("cashout")) {
          A.sessionParams.cashoutUrl = this.__av_url;
          A.sessionParams.cashoutHeaders = this.__av_headers;
          A.sessionParams.lastCashoutBody = body;
        } else if (url.includes("bet")) {
          A.sessionParams.betUrl = this.__av_url;
          A.sessionParams.betHeaders = this.__av_headers;
          A.sessionParams.lastBetBody = body;
        }
      }
    } catch (e) {}
    return origSendXHR.apply(this, arguments);
  };

  // ===================== DOM Node Extractor (MutationObserver) =====================
  const obs = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          let btns =
            node.tagName === "BUTTON"
              ? [node]
              : node.querySelectorAll("button, .btn-success, .btn-warning");
          btns.forEach((b) => {
            let txt = (b.textContent || b.innerText || "")
              .toLowerCase()
              .replace(/[\s\n\r]/g, "");
            if (
              txt.includes("cashout") ||
              txt.includes("снять") ||
              b.classList.contains("btn-warning")
            ) {
              if (!A.domCache.cashout.includes(b)) A.domCache.cashout.push(b);
            }
            // The user's DOM shows: class="btn btn-success bet ng-star-inserted"
            else if (
              txt.includes("bet") ||
              txt.includes("ставка") ||
              b.classList.contains("btn-success") ||
              b.classList.contains("bet")
            ) {
              if (!A.domCache.bet.includes(b)) A.domCache.bet.push(b);
            }
          });
        }
      });
    });
  });
  if (document.body)
    obs.observe(document.body, { childList: true, subtree: true });
  else
    document.addEventListener("DOMContentLoaded", () =>
      obs.observe(document.body, { childList: true, subtree: true }),
    );

  // ===================== UI AGENT PANEL =====================
  let uiLog;
  let uiStatus;

  function logAgent(msg, color = "#aaa", isBold = false) {
    if (!uiLog) return;
    const div = document.createElement("div");
    div.textContent = `> ${msg}`;
    div.style.color = color;
    div.style.fontFamily = "monospace";
    div.style.fontSize = "11px";
    div.style.borderBottom = "1px solid #333";
    div.style.padding = "2px 0";
    if (isBold) div.style.fontWeight = "bold";
    uiLog.prepend(div);
    if (uiLog.children.length > 20) uiLog.removeChild(uiLog.lastChild);
  }

  function updateLogEl() {
    if (!uiStatus) return;
    uiStatus.innerHTML = `
            <div><b>Agent:</b> <span style="color:${A.armed ? "#4fff4f" : "#ff4f4f"}">${A.armed ? "ARMED" : "OFF"}</span></div>
            <div><b>Mode:</b> Skip ${A.skipMode} | <b>Bet:</b> ${A.currentBetAmount > 0 ? A.currentBetAmount : 20}.00 LKR</div>
            <div><b>Status:</b> ${A.betState.toUpperCase()} | Skip Queue: ${A.currentSkip}/${A.targetSkip}</div>
            <div><b>Target Cashout:</b> ${A.targetMultiplier > 0 ? A.targetMultiplier + "x" : "Pending"}</div>
            <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #555; color:#ffaa00;">
                <b>Martingale:</b> Losses: ${A.consecutiveLosses} / Start At: ${A.martingaleStartLosses} | Max: ${A.maxMartingaleSteps}
            </div>
        `;
  }

  function createUI() {
    if (document.getElementById("av-agent-panel")) return;

    const panel = document.createElement("div");
    panel.id = "av-agent-panel";
    panel.style.cssText = `
            position: fixed; top: 10px; right: 280px; width: 280px;
            background: rgba(15, 15, 20, 0.85); border: 1px solid rgba(0, 255, 204, 0.3); border-radius: 12px;
            color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6); z-index: 999999;
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        `;

    const title = document.createElement("div");
    title.innerHTML = "🤖 <b>V9 AUTONOMOUS AGENT</b>";
    title.style.cssText =
      "text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 12px; color: #00ffcc; text-shadow: 0 0 8px rgba(0,255,204,0.5); font-size: 14px; cursor: grab; user-select: none;";

    // --- DRAG AND DROP SUBSYSTEM ---
    let isDragging = false;
    let diffX = 0,
      diffY = 0;

    title.addEventListener("mousedown", (e) => {
      isDragging = true;
      title.style.cursor = "grabbing";
      diffX = e.clientX - panel.getBoundingClientRect().left;
      diffY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      panel.style.left = e.clientX - diffX + "px";
      panel.style.top = e.clientY - diffY + "px";
      panel.style.right = "auto"; // Disable right anchoring
      panel.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      title.style.cursor = "grab";
    });
    // ---------------------------------

    panel.appendChild(title);

    // Controls
    const controlBox = document.createElement("div");
    controlBox.style.display = "flex";
    controlBox.style.flexDirection = "column";
    controlBox.style.gap = "8px";

    // Toggle
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "AGENT: OFF";
    toggleBtn.style.cssText =
      "background: linear-gradient(135deg, #3a0000, #1a0000); color: #fff; border: 1px solid #ff4444; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; transition: all 0.3s ease; text-shadow: 0 0 5px rgba(255,0,0,0.5);";
    toggleBtn.onclick = () => {
      A.armed = !A.armed;
      if (A.armed) {
        toggleBtn.textContent = "⚡ AGENT: ARMED";
        toggleBtn.style.background =
          "linear-gradient(135deg, #003a00, #001a00)";
        toggleBtn.style.border = "1px solid #00ffcc";
        toggleBtn.style.boxShadow = "0 0 15px rgba(0,255,204,0.4)";
        toggleBtn.style.textShadow = "0 0 5px rgba(0,255,204,0.8)";
        generateNextTargetSkip();
        generateNextTargetMultiplier();
      } else {
        toggleBtn.textContent = "AGENT: OFF";
        toggleBtn.style.background =
          "linear-gradient(135deg, #3a0000, #1a0000)";
        toggleBtn.style.border = "1px solid #ff4444";
        toggleBtn.style.boxShadow = "none";
        toggleBtn.style.textShadow = "0 0 5px rgba(255,0,0,0.5)";
      }
      updateLogEl();
    };

    // Inputs
    const skipLabel = document.createElement("label");
    skipLabel.textContent = "Bet Round Randomness:";
    skipLabel.style.fontSize = "11px";
    const selSkip = document.createElement("select");
    selSkip.style.cssText =
      "background: #222; color: #fff; border: 1px solid #555; padding: 4px; border-radius: 3px; font-size: 11px;";
    selSkip.innerHTML = `<option value="1-3">Random 1-3 Rounds</option><option value="4-5">Random 4-5 Rounds</option><option value="6-10">Random 6-10 Rounds</option>`;
    selSkip.onchange = (e) => {
      A.skipMode = e.target.value;
      generateNextTargetSkip();
      updateLogEl();
    };

    const amtLabel = document.createElement("label");
    amtLabel.textContent = "Bet Amount (Pre-load manually first):";
    amtLabel.style.fontSize = "11px";
    const selAmt = document.createElement("select");
    selAmt.style.cssText =
      "background: #222; color: #fff; border: 1px solid #555; padding: 4px; border-radius: 3px; font-size: 11px;";
    selAmt.innerHTML = `<option value="stable20">Stable 20 (Uses Seed Packet)</option><option value="random4060100">Random 40/60/100 (WS Only)</option><option value="martingale">Martingale Strategy</option>`;
    selAmt.onchange = (e) => {
      A.amountMode = e.target.value;
      updateLogEl();
    };

    const cashoutLabel = document.createElement("label");
    cashoutLabel.textContent = "Random Cash Out Bounds:";
    cashoutLabel.style.fontSize = "11px";
    cashoutLabel.style.marginTop = "4px";
    const selCashout = document.createElement("select");
    selCashout.style.cssText =
      "background: #222; color: #fff; border: 1px solid #1fa3ff; padding: 4px; border-radius: 3px; font-size: 11px; font-weight: bold;";
    selCashout.innerHTML = `<option value="1.10-1.20">Between 1.10x - 1.20x Randomly</option><option value="1.50-1.98">Between 1.50x - 1.98x Randomly</option><option value="2.00-2.97">Between 2.00x - 2.97x Randomly</option>`;
    selCashout.onchange = (e) => {
      A.cashoutMode = e.target.value;
      generateNextTargetMultiplier();
      updateLogEl();
    };

    const mgStartLabel = document.createElement("label");
    mgStartLabel.textContent = "Martingale: After X Losses:";
    mgStartLabel.style.fontSize = "11px";
    mgStartLabel.style.marginTop = "4px";
    const selMgStart = document.createElement("select");
    selMgStart.style.cssText =
      "background: #222; color: #fff; border: 1px solid #ff44aa; padding: 4px; border-radius: 3px; font-size: 11px;";
    let mgStartHTML = "";
    for (let i = 1; i <= 9; i++) {
      mgStartHTML += `<option value="${i}" ${i === 3 ? "selected" : ""}>${i} Losses</option>`;
    }
    selMgStart.innerHTML = mgStartHTML;
    selMgStart.onchange = (e) => {
      A.martingaleStartLosses = parseInt(e.target.value);
      updateLogEl();
    };

    const mgMaxLabel = document.createElement("label");
    mgMaxLabel.textContent = "Martingale: Max Steps (Safeguard):";
    mgMaxLabel.style.fontSize = "11px";
    mgMaxLabel.style.marginTop = "4px";
    const selMgMax = document.createElement("select");
    selMgMax.style.cssText =
      "background: #222; color: #fff; border: 1px solid #ff44aa; padding: 4px; border-radius: 3px; font-size: 11px;";
    let mgMaxHTML = "";
    for (let i = 1; i <= 9; i++) {
      mgMaxHTML += `<option value="${i}" ${i === 8 ? "selected" : ""}>${i} Steps</option>`;
    }
    selMgMax.innerHTML = mgMaxHTML;
    selMgMax.onchange = (e) => {
      A.maxMartingaleSteps = parseInt(e.target.value);
      updateLogEl();
    };

    controlBox.appendChild(toggleBtn);
    controlBox.appendChild(skipLabel);
    controlBox.appendChild(selSkip);
    controlBox.appendChild(amtLabel);
    controlBox.appendChild(selAmt);
    controlBox.appendChild(cashoutLabel);
    controlBox.appendChild(selCashout);
    controlBox.appendChild(mgStartLabel);
    controlBox.appendChild(selMgStart);
    controlBox.appendChild(mgMaxLabel);
    controlBox.appendChild(selMgMax);
    panel.appendChild(controlBox);

    // Status
    uiStatus = document.createElement("div");
    uiStatus.style.cssText =
      "margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; font-size: 11px; font-family: monospace; line-height: 1.5; color: #ccc;";
    panel.appendChild(uiStatus);

    // Realtime Scan Viewer
    const scanStatus = document.createElement("div");
    scanStatus.id = "av-scan-status";
    scanStatus.textContent = "[SCAN] AWAITING FLIGHT...";
    scanStatus.style.cssText =
      "margin-top: 8px; font-size: 9px; color: #00ffcc; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(0, 50, 40, 0.4); padding: 4px; border: 1px solid rgba(0, 255, 204, 0.2); border-radius: 4px;";
    panel.appendChild(scanStatus);

    // Logs
    const logHeader = document.createElement("div");
    logHeader.textContent = "AGENT EXECUTION LOG";
    logHeader.style.cssText =
      "margin-top: 12px; font-size: 10px; color: #888; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;";
    panel.appendChild(logHeader);

    uiLog = document.createElement("div");
    uiLog.style.cssText =
      "height: 140px; overflow-y: auto; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 6px; margin-top: 6px; font-family: monospace;";
    panel.appendChild(uiLog);

    // Inject into body exactly like aviator-signal.user.js
    document.body.appendChild(panel);
    updateLogEl();
  }

  // Boot UI exactly matching signal script
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", createUI);
  else createUI();
})();

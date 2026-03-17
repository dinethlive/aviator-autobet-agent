# Aviator Autobet Agent

**Client-side security research tool demonstrating automated interaction techniques with the Aviator crash game**

---

## Screenshot

![Aviator Autobet Agent Screenshot](screenshots/aviator-autobet-agent-ss-1.png)

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
   - [Event Listener Hijacking (V7)](#event-listener-hijacking-v7)
   - [Memory Probe Exploitation (V9)](#memory-probe-exploitation-v9)
   - [WebSocket Injection (V8)](#websocket-injection-v8)
   - [Human Emulation Techniques](#human-emulation-techniques)
3. [Configuration Modes](#configuration-modes)
   - [Skip Modes](#skip-modes)
   - [Amount Modes](#amount-modes)
   - [Cashout Modes](#cashout-modes)
4. [Technical Architecture](#technical-architecture)
   - [Agent State Management](#agent-state-management)
   - [Network Payload Capture](#network-payload-capture)
   - [DOM Element Caching](#dom-element-caching)
5. [Disclaimer](#disclaimer)
6. [Educational Purpose Only](#educational-purpose-only)

---

## Overview

The `aviator-autobet-agent.js` is a Userscript designed to interface with the Aviator crash game, commonly found on various online betting platforms (such as Melbet). The script operates by intercepting and analyzing client-side network communications, DOM event streams, and JavaScript memory structures to understand the game's betting mechanisms.

This script demonstrates several client-side exploitation techniques commonly found in web application security research. It is intended purely for educational and defensive security research purposes.

---

## How It Works

The script employs multiple interaction layers to place bets and execute cashouts automatically. Each layer serves as a fallback mechanism if the previous layer fails to execute successfully.

### Event Listener Hijacking (V7)

The script intercepts the native `EventTarget.prototype.addEventListener` method to capture all click-related event listeners (click, pointerdown, touchstart) before they are registered. These captured listeners are stored in a custom `__av_listeners` property attached to DOM elements.

**Technical Details:**

- Wraps the original `addEventListener` function
- Stores listener references in a non-enumerable property
- Enables replay of stolen listeners with synthetic event objects that mimic trusted events (setting `isTrusted: true`)
- Bypasses Angular's `e.isTrusted` validation checks

### Memory Probe Exploitation (V9)

The V9 Memory Probe technique searches through JavaScript heap memory attached to DOM elements to locate and invoke framework-specific component methods.

**Technical Details:**

- Searches for framework-specific properties:
  - `__react` (React)
  - `__ngContext__` (Angular)
  - `__vue__` (Vue.js)
- Traverses component parent hierarchies up to 8 levels deep
- Searches for methods matching keywords: "bet", "place", "cash", "withdraw", "collect"
- Executes discovered functions directly from memory
- Scans both the element itself and its entire descendant tree

### WebSocket Injection (V8)

The script captures WebSocket messages exchanged between the client and server, then replays them with modified parameters.

**Technical Details:**

- Intercepts WebSocket messages during game initialization
- Captures both bet placement and cashout request payloads
- Modifies bet amounts in captured payloads using regex replacement
- Replays encrypted payloads directly via the native WebSocket connection
- Serves as a high-speed fallback mechanism with minimal latency

### Human Emulation Techniques

To avoid detection by anti-automation systems, the script monitors the user's physical mouse cursor position and fires synthetic events at the exact coordinates.

**Technical Details:**

- Tracks mouse position via `mousemove` event listener
- Only fires clicks when the cursor is physically positioned over target buttons
- Dispatches a sequence of events: pointerdown → mousedown → pointerup → mouseup → click
- Sets accurate clientX, clientY, screenX, screenY coordinates
- Includes button property checks (buttons: 1)

---

## Configuration Modes

The agent offers several configurable modes that determine betting behavior.

### Skip Modes

Controls how many rounds to skip before placing the next bet:

| Mode   | Description                  |
| ------ | ---------------------------- |
| `1-3`  | Skip 1 to 3 rounds (default) |
| `4-5`  | Skip 4 to 5 rounds           |
| `6-10` | Skip 6 to 10 rounds          |

### Amount Modes

Determines the bet amount strategy:

| Mode            | Description                                |
| --------------- | ------------------------------------------ |
| `stable20`      | Fixed bet of 20 currency units             |
| `random4060100` | Random selection from 40, 60, or 100       |
| `martingale`    | Doubling strategy after consecutive losses |

**Martingale Configuration:**

- Starts doubling after 3 consecutive losses (configurable via `martingaleStartLosses`)
- Maximum 8 doubling steps (configurable via `maxMartingaleSteps`)
- Resets to base bet (20) after reaching max steps or upon manual reset

### Cashout Modes

Sets the target multiplier for automatic cashout:

| Mode        | Description                                |
| ----------- | ------------------------------------------ |
| `1.10-1.20` | Cashout at random 1.10x to 1.20x (default) |
| `1.50-1.98` | Cashout at random 1.50x to 1.98x           |
| `2.00-2.97` | Cashout at random 2.00x to 2.97x           |

---

## Technical Architecture

### Agent State Management

The script maintains an `A` (Agent) object that tracks:

- **Armed Status**: Whether the agent is actively placing bets
- **Current State**: idle → bet_placed → flying → cashed_out
- **Consecutive Losses**: Persisted in sessionStorage
- **Session Parameters**: Captured URLs, headers, and payloads
- **Target Values**: Skip count and cashout multiplier

### Network Payload Capture

The script captures network communication through multiple mechanisms:

- **WebSocket Interception**: Monitors `ws.send()` calls for bet/cashout messages
- **HTTP Request Capture**: Hooks `fetch` and `XMLHttpRequest` to capture API endpoints
- **Payload Storage**: Stores last bet and cashout bodies with headers for replay

### DOM Element Caching

The script caches references to betting-related DOM elements:

- Bet button elements
- Cashout button elements
- Input fields (detected by `inputmode="decimal"` attribute)

---

## Disclaimer

### Important Legal Notice

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

By using, installing, or executing this script, you acknowledge and agree that:

1. **Terms of Service Violation**: This script likely violates the Terms of Service (ToS) and End User License Agreement (EULAs) of the targeted betting platforms. Use may result in account suspension, banning, or legal action.

2. **Legal Implications**: The use of automated tools to interact with online gambling platforms may be illegal in your jurisdiction. You are solely responsible for ensuring compliance with all applicable laws and regulations.

3. **Financial Risk**: Automated gambling carries significant financial risk. The creators and contributors of this project accept no responsibility for any financial losses incurred.

4. **Account Termination**: Betting platforms actively detect and block automated tools. Use may result in permanent account termination and forfeiture of funds.

5. **No Liability**: The author(s) of this software shall not be held liable for any damages, losses, or consequences arising from the use or misuse of this script.

---

## Educational Purpose Only

This project is intended solely for **educational and defensive security research purposes**.

### What This Means:

- **Understanding Web Application Security**: This script demonstrates how client-side web applications can be vulnerable to various attack vectors, including:
  - Event listener interception
  - Client-side memory analysis
  - WebSocket protocol manipulation
  - DOM-based exploitation

- **Defensive Research**: Security researchers can use this code to:
  - Understand attack methodologies
  - Develop better detection mechanisms
  - Strengthen client-side security controls
  - Test anti-automation measures

- **Academic Study**: This code serves as a practical example for studying:
  - Browser extension/UserScript mechanics
  - JavaScript runtime internals
  - WebSocket security
  - Client-side exploit techniques

### Prohibited Uses:

You are expressly prohibited from using this software to:

- Cheat at online gambling
- Steal funds from betting platforms
- Exploit vulnerabilities for financial gain
- Violate any applicable laws or regulations

---

## For Security Researchers

If you are a security researcher interested in defensive applications of this knowledge, consider:

1. **Detection Mechanisms**: Developing client-side and server-side detection for automated tools
2. **Security Hardening**: Implementing measures to prevent memory probing and event hijacking
3. **Behavioral Analysis**: Creating systems to identify non-human interaction patterns
4. **WebSocket Security**: Improving protocol security to prevent message replay attacks

---

_Last Updated: March 2026_

_This documentation is for educational purposes only. The maintainers assume no responsibility for misuse of this information._

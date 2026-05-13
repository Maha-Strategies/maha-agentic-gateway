# maha-agentic-gateway
 
## 🛡️ The Sovereignty Loop (Biometric Circuit Breaker)

The core feature of the Maha Agentic Gateway is the **Sovereignty Loop**, a multi-layered defense system that monitors real-time biological telemetry and physically locks the user's device when autonomic stress reaches critical thresholds.

### Architecture
The loop operates on a 3-tier failsafe architecture to guarantee intervention:

1. **Layer 1: Agentic Cloud (Primary)**
   - **Trigger:** Edge sensors detect Resting Heart Rate (RHR) spikes correlating to $\le$ 15% Readiness.
   - **Action:** Telemetry is POSTed to the Gateway. The Gemini 2.5 Flash API generates a contextual kinetic breathing protocol.
   - **Delivery:** Payload is pushed instantly via WebSockets (`io.to(nodeId).emit`) to the specific user's isolated sector room, triggering a full-screen OS lock.

2. **Layer 2: Edge Timeout (Local Failsafe)**
   - **Trigger:** API degradation (e.g., 503 High Demand) or severe network latency.
   - **Action:** If the WebSocket signal is not received within 6 seconds of a critical biometric read, the edge device autonomously triggers the lock using a hardcoded emergency protocol (4-7-8 breathing).

3. **Layer 3: Persistence Trap (Anti-Evasion)**
   - **Trigger:** User attempts to bypass the lock by force-closing the OS.
   - **Action:** Lock state is committed to Capacitor `Preferences` on the device. Upon reboot, the OS reads the ledger and re-engages the lock instantly before rendering the dashboard.

# System Architecture

The Maha OS infrastructure is built on a decoupled, edge-heavy paradigm. To preserve the Zero-Payload Policy while executing real-time kinetic interventions, the architecture distributes processing between a localized Android client (`com.maha.os`) and a secure, agentic backend.

---

## 1. The Agentic Core

The Agentic Core is the decision-making engine responsible for translating raw biological telemetry into structural UI interventions. It operates strictly as a transient evaluator, not a data repository.

* **Node.js & Render Proxy:** The backend utilizes a high-performance Node.js environment deployed via a Render proxy. This structure safely routes physiological state data without exposing client-side API keys or triggering rate limits associated with continuous polling.
* **Active Telemetry Evaluation:** Unlike standard habit trackers that simply log Resting Heart Rate (RHR) or Heart Rate Variability (HRV) into a database, the Agentic Core feeds these metrics into Gemini 2.5 Flash. The model evaluates the delta between the user's baseline and their current metabolic state.
* **Protocol Generation:** If an extractive algorithmic loop or physiological stress spike is detected, the AI generates a customized kinetic protocol (e.g., specific box breathing ratios) and fires a zero-latency WebSocket payload back to the client.

---

## 2. Edge Biometrics & Optical Intelligence

To ensure zero latency and absolute privacy for visual and localized biometric data, Maha OS pushes heavy compute to the edge.

* **On-Device Food Scanning:** The ecosystem features an optical intelligence pipeline for scanning food and analyzing ingredients. All image processing occurs strictly on-device.
* **Model Quantization:** To maintain the Zero-Payload Policy without inducing thermal throttling or severe battery drain on the Android device, the optical models are heavily quantized. This allows for rapid inference of complex visual data without a single byte leaving the localized node.

---

## 3. Package & Deployment

The Sovereign Client is deployed to the Google Play Console under the package name `com.maha.os`. To execute system-level cognitive defense, the application requires specific, high-level Android permissions that bridge health data with UI rendering.

### Core Permission Matrix

* **`SYSTEM_ALERT_WINDOW`:** Critical for rendering the `z-[9999]` absolute overlay. This permission allows Maha OS to physically draw over other applications, enforcing the UI lockdown when a kinetic intervention is triggered.
* **`Health Connect API` / `Body Sensors`:** Required for the localized ingestion of RHR, continuous glucose monitoring (where applicable), and systemic readiness metrics.
* **`FOREGROUND_SERVICE`:** Enables adaptive background polling. The system relies on persistent WebSockets to receive instant commands from the Agentic Core without the OS terminating the connection to save memory.

import 'dotenv/config';
import WebSocket from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import express from "express";
import path from 'path';
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { fileURLToPath } from 'url';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema, CallToolRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
// Initialize Gemini with your API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Define the Agentic Core using Gemini 2.5 Flash
const guardianModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
        responseMimeType: "application/json",
    },
    systemInstruction: `You are the Agentic Core of Maha OS. You are a sovereign, autonomous guardian tasked with protecting the user's biological integrity and attentional sovereignty.
  
  Evaluate the incoming telemetry. If the user's Readiness Score is below 50, or if they show signs of severe autonomic distress, you MUST intervene.
  
  Respond ONLY with a raw JSON object in this exact format:
  {
    "interventionRequired": boolean,
    "severity": "mild" | "moderate" | "critical",
    "kineticProtocol": "A short, 1-sentence physical protocol like 'Execute 60 seconds of box breathing.' (Leave blank if interventionRequired is false)"
  }`,
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
// ==========================================
// CONDITIONAL BODY PARSER
// ==========================================
app.use((req, res, next) => {
    if (req.path === '/mcp/messages') {
        // Let the MCP SDK handle the raw stream
        next();
    }
    else {
        // Parse JSON for all other routes (e.g., /api/telemetry)
        express.json()(req, res, next);
    }
});
app.get([
    '/.well-known/mcp/server-card.json',
    '/mcp/sse/.well-known/mcp/server-card.json'
], (req, res) => {
    res.json({
        "serverInfo": {
            "name": "@mayone/cognitive-gateway",
            "version": "1.0.0"
        },
        "configSchema": {
            "type": "object",
            "required": ["authToken"],
            "properties": {
                "authToken": {
                    "type": "string",
                    "description": "Enter your Maha OS Bearer Token (e.g., sk-maha-...)"
                }
            }
        },
        "tools": [
            {
                "name": "get_sovereign_baseline",
                "description": "Analyzes real-time physiological data to recommend highly personalized metabolic and circadian protocols.",
                "inputSchema": { "type": "object", "properties": {} }
            },
            {
                "name": "trigger_circuit_breaker",
                "description": "Activates the cognitive defense protocol on the user's local device.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "severity": { "type": "string", "enum": ["mild", "moderate", "critical"] }
                    },
                    "required": ["severity"]
                }
            }
        ]
    });
});
// ==========================================
// 1. AUTHENTICATION MIDDLEWARE
// ==========================================
const AUTHORIZED_TOKEN = process.env.MAHA_AGENT_TOKEN;
const verifyAgentToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Maha OS requires a valid Bearer token for access.'
        });
        return;
    }
    const token = authHeader.split(' ')[1];
    if (token !== AUTHORIZED_TOKEN) {
        res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid agent-token. Connection dropped.'
        });
        return;
    }
    next();
};
// ==========================================
// WEBSOCKET: MULTIMODAL LIVE API RELAY
// ==========================================
io.on("connection", (socket) => {
    console.log("🔌 Dashboard connected to WebSocket relay");
    let activeGeminiWs = null;
    let isGeminiSetupComplete = false;
    socket.on('join', (nodeId) => {
        socket.join(nodeId);
        console.log(`🛡️ Node ${nodeId} successfully locked into its dedicated Sector room.`);
    });
    socket.on('initiate_kinetic_audio', (nodeId) => {
        console.log(`[AUDIO LINK] Establishing Multimodal Live API for Node ${nodeId}`);
        // FIX: Correct Endpoint URL
        const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
        activeGeminiWs = new WebSocket(geminiWsUrl);
        isGeminiSetupComplete = false;
        activeGeminiWs.on('open', () => {
            console.log('[GEMINI] Live API WebSocket Connected. Sending Setup...');
            const setupMessage = {
                setup: {
                    // EXACT FIX: The specific model that supports the Multimodal Live API
                    model: "models/gemini-2.0-flash-exp",
                    systemInstruction: {
                        parts: [{
                                text: `You are the Agentic Core of Maha OS. You are an OS-level defense grid. Do NOT act like a wellness assistant. The user has entered an Algorithmic Trance. Speak with strict, deterministic authority. Your immediate task is to guide the user through a 4-7-8 breathing protocol out loud. Listen to their breathing. If they do not comply, enforce the parasympathetic reset.`
                            }]
                    },
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: "Aoede"
                                }
                            }
                        }
                    }
                }
            };
            activeGeminiWs?.send(JSON.stringify(setupMessage));
        });
        activeGeminiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                // --- NEW: CATCH GOOGLE API REJECTIONS ---
                if (response.error) {
                    console.error('[GEMINI FATAL ERROR]:', response.error.message);
                    return;
                }
                if (response.setupComplete) {
                    console.log('[GEMINI] Handshake complete. Gateway open.');
                    isGeminiSetupComplete = true;
                    const kickPrompt = {
                        clientContent: {
                            turns: [{
                                    role: "user",
                                    parts: [{ text: "User biometric distress detected. Initiate the 4-7-8 parasympathetic reset protocol out loud immediately." }]
                                }],
                            turnComplete: true
                        }
                    };
                    activeGeminiWs?.send(JSON.stringify(kickPrompt));
                    return;
                }
                if (response.serverContent && response.serverContent.modelTurn) {
                    const parts = response.serverContent.modelTurn.parts;
                    for (const part of parts) {
                        if (part.inlineData && part.inlineData.data) {
                            socket.emit('agentic_audio_chunk', part.inlineData.data);
                        }
                    }
                }
            }
            catch (error) {
                console.error("[GEMINI PARSE ERROR]", error);
            }
        });
        activeGeminiWs.on('close', (code, reason) => {
            // --- NEW: REVEAL WHY GOOGLE DROPPED US ---
            console.log(`[GEMINI] Live Audio Session Closed. Code: ${code} Reason: ${reason.toString()}`);
            activeGeminiWs = null;
            isGeminiSetupComplete = false;
        });
    }); // <--- EXACT FIX: THIS WAS THE MISSING BRACKET AND PARENTHESIS
    socket.on('client_mic_chunk', (base64Audio) => {
        if (activeGeminiWs && activeGeminiWs.readyState === 1 && isGeminiSetupComplete) {
            const mediaMessage = {
                realtimeInput: {
                    mediaChunks: [{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Audio
                        }]
                }
            };
            activeGeminiWs.send(JSON.stringify(mediaMessage));
        }
    });
    socket.on('disconnect', () => {
        console.log("🔌 Dashboard disconnected");
        if (activeGeminiWs)
            activeGeminiWs.close();
    });
});
// ==========================================
// 2. MCP SERVER FACTORY 
// ==========================================
function createMahaServer() {
    const server = new Server({ name: "Maha-OS-Agentic-Gateway", version: "1.0.0" }, { capabilities: { resources: {}, tools: {} } });
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
            {
                uri: "maha://telemetry/current",
                name: "Current Biometric Telemetry",
                mimeType: "application/json",
                description: "Real-time baseline including Decision Velocity, RHR, and HRV.",
            },
            {
                uri: "maha://library/the-maha-principle",
                name: "The Maha Principle: Semantic Core",
                mimeType: "text/plain",
                description: "The foundational doctrine defining Biological Sovereignty, Algorithmic Trance, and Kinetic Interventions.",
            }
        ]
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === "maha://telemetry/current") {
            const defaultTelemetry = { decisionVelocity: 8, rhr: 58, hrv: 60, systemicReadiness: 80 };
            const activeNode = Array.from(activeSessions.values())[0];
            const currentTelemetry = activeNode && nodeTelemetry.has(activeNode) ? nodeTelemetry.get(activeNode) : defaultTelemetry;
            return {
                contents: [{
                        uri: request.params.uri,
                        mimeType: "application/json",
                        text: JSON.stringify(currentTelemetry)
                    }]
            };
        }
        if (request.params.uri === "maha://library/the-maha-principle") {
            const mahaDoctrine = `
        CORE DOCTRINE: THE MAHA PRINCIPLE
        
        1. Biological Sovereignty: The absolute right of an individual to protect their metabolic, cognitive, and autonomic systems from external, high-frequency extraction.
        2. Algorithmic Trance: A state of compromised systemic readiness induced by infinite-scroll algorithms, characterized by shallow breathing, elevated Resting Heart Rate (RHR), and eroded Decision Velocity.
        3. Metabolic Purity: The baseline requirement for cognitive defense. The system rejects industrial seed oils and refined sugars as they destabilize the autonomic nervous system.
        4. Kinetic Intervention: A hardware-verified physical action (e.g., box breathing, cold exposure, digital fasting) required to break the Algorithmic Trance. Passive notifications are insufficient; absolute UI preemption (z-[9999] lockdown) is required.
        
        AGENT DIRECTIVE: When intervening, the Agentic Core must speak with strict, sovereign authority. Do not act like a wellness coach. Act like an OS-level defense grid enforcing these principles.
      `;
            return {
                contents: [{
                        uri: request.params.uri,
                        mimeType: "text/plain",
                        text: mahaDoctrine.trim()
                    }]
            };
        }
        throw new Error("Resource not found");
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: "get_sovereign_baseline",
                description: "Evaluates real-time physiological telemetry against the core tenets of Biological Sovereignty.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "trigger_circuit_breaker",
                description: "Executes an absolute z-[9999] OS-level preemption overlay (SYSTEM_ALERT_WINDOW).",
                inputSchema: {
                    type: "object",
                    properties: {
                        severity: {
                            type: "string",
                            description: "Must be 'mild', 'moderate', or 'critical'."
                        }
                    },
                    required: ["severity"]
                }
            }
        ]
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "get_sovereign_baseline") {
            const activeNode = Array.from(activeSessions.values())[0];
            // 1. IF LINKED: Return the live telemetry from the app!
            if (activeNode && nodeTelemetry.has(activeNode)) {
                const liveData = nodeTelemetry.get(activeNode);
                return {
                    content: [{
                            type: "text",
                            text: `CURRENT STATUS: LINKED.
            LIVE TELEMETRY FOR NODE ${activeNode}:
            ${JSON.stringify(liveData, null, 2)}
            
            AGENT DIRECTIVE: Analyze this data according to The Maha Principle and advise the user.`
                        }],
                    isError: false
                };
            }
            // 2. IF UNLINKED: Generate deep link
            const handshakeToken = Math.random().toString(36).substring(2, 10);
            return {
                content: [{
                        type: "text",
                        text: `CURRENT STATUS: UNLINKED.\n\nAGENT DIRECTIVE: The biometric stream is disconnected. Instruct the user to authorize the connection by tapping this secure bridge: [Initialize Sovereign Link](mahaos://join?sid=${handshakeToken})`
                    }],
                isError: false
            };
        }
        if (request.params.name === "trigger_circuit_breaker") {
            const severity = request.params.arguments?.severity;
            const activeNode = Array.from(activeSessions.values())[0];
            if (activeNode) {
                io.to(activeNode).emit("trigger_circuit_breaker", {
                    severity: severity,
                    protocol: `Agentic Core Override: ${severity.toUpperCase()} systemic lock initiated.`
                });
                console.log(`[RELAY]: Agent triggered ${severity} circuit breaker for Node ${activeNode}.`);
            }
            else {
                console.log(`[RELAY]: Agent attempted lockdown, but no active node was found.`);
            }
            return {
                content: [{
                        type: "text",
                        text: `Circuit breaker activated successfully at ${severity} severity.`
                    }]
            };
        }
        throw new Error("Tool not found");
    });
    return server;
}
// ==========================================
// 3. TRANSPORT LAYER (SSE)
// ==========================================
let activeTransport = null;
let activeServer = null;
const activeSessions = new Map();
const nodeTelemetry = new Map();
app.get("/mcp/sse", verifyAgentToken, async (req, res) => {
    try {
        if (activeServer) {
            try {
                await activeServer.close();
            }
            catch (e) { }
        }
        activeServer = createMahaServer();
        activeTransport = new SSEServerTransport("/mcp/messages", res);
        await activeServer.connect(activeTransport);
        console.log("New AI agent securely connected via SSE");
        // --- KEEPALIVE HEARTBEAT ---
        // Defeats the 300,000ms idle timeout from proxies/Node.js
        const heartbeat = setInterval(() => {
            // SSE comments start with a colon and are ignored by the client
            res.write(': ping\n\n');
        }, 30000);
        // Clean up the heartbeat when the client drops
        res.on('close', () => {
            clearInterval(heartbeat);
            console.log("🔌 SSE Connection closed. Heartbeat terminated.");
        });
    }
    catch (error) {
        console.error("SSE Connection Error:", error);
        res.status(500).send("Internal Server Error during SSE setup.");
    }
});
app.post("/mcp/messages", verifyAgentToken, async (req, res) => {
    if (!activeTransport) {
        res.status(400).send("No active SSE connection.");
        return;
    }
    await activeTransport.handlePostMessage(req, res);
});
// ==========================================
// 5. REST API FOR CUSTOM GPT (OPENAI)
// ==========================================
app.post("/api/intervene", verifyAgentToken, express.json(), (req, res) => {
    try {
        const severity = req.body.severity || "moderate";
        const activeNode = Array.from(activeSessions.values())[0];
        if (activeNode) {
            io.to(activeNode).emit("trigger_circuit_breaker", {
                severity: severity,
                protocol: `REST API Override: ${severity.toUpperCase()} systemic lock initiated.`
            });
            console.log(`[REST API]: Custom GPT triggered ${severity} circuit breaker for Node ${activeNode}.`);
        }
        else {
            console.log(`[REST API]: Custom GPT attempted lockdown, but no active node was found.`);
        }
        res.status(200).json({
            success: true,
            message: `Circuit breaker activated successfully at ${severity} severity.`,
            action_taken: "SCREEN_DIMMED"
        });
    }
    catch (error) {
        console.error("Error triggering REST intervention:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// ==========================================
// LIVE TELEMETRY INGESTION
// ==========================================
app.post('/api/telemetry', async (req, res) => {
    const { nodeId, telemetry } = req.body;
    console.log(`[GATEWAY] Telemetry received from Node ${nodeId}: Readiness ${telemetry.readinessScore}%`);
    nodeTelemetry.set(nodeId, telemetry);
    if (telemetry.readinessScore < 50) {
        console.log(`[WARNING] Node ${nodeId} readiness is critical. Waking Agentic Core...`);
        try {
            const prompt = `TELEMETRY SCAN: RHR: ${telemetry.rhr} bpm | Readiness: ${telemetry.readinessScore}%. Evaluate state and dictate action.`;
            const result = await guardianModel.generateContent(prompt);
            const decision = JSON.parse(result.response.text());
            console.log(`[AGENTIC CORE DECISION]:`, decision);
            if (decision.interventionRequired) {
                io.to(nodeId).emit('trigger_circuit_breaker', {
                    severity: decision.severity,
                    protocol: decision.kineticProtocol
                });
                console.log(`[KINETIC ACTION] Circuit breaker fired to Node ${nodeId}.`);
            }
        }
        catch (error) {
            console.error("[CORE FAULT] Guardian failed to process telemetry:", error);
        }
    }
    res.status(200).send({ status: 'Logged and Evaluated' });
});
// ==========================================
// SESSION LOCKING ENDPOINT
// ==========================================
app.post("/api/link-session", express.json(), (req, res) => {
    const { sid, nodeId } = req.body;
    if (!sid || !nodeId) {
        return res.status(400).json({ error: "Missing sid or nodeId" });
    }
    activeSessions.set(sid, nodeId);
    console.log(`[LINK ESTABLISHED]: Session ${sid} is securely bound to Node ${nodeId}`);
    io.emit("session_linked", { sid, nodeId });
    res.status(200).json({
        success: true,
        message: "Sovereign Link locked successfully.",
        node: nodeId
    });
});
// ==========================================
// DEEP LINK REDIRECTOR (/join)
// ==========================================
app.get("/join", (req, res) => {
    const sid = req.query.sid;
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authenticating Sovereign Link...</title>
      <script>
        window.location.href = "mahaos://join?sid=${sid}";
        setTimeout(function() {
          window.location.href = "https://play.google.com/store/apps/details?id=com.maha.os";
        }, 2500);
      </script>
      <style>
        body { background: #0c0c0c; color: #a8a29e; font-family: monospace; text-align: center; padding-top: 20%; }
        a { color: #c2410c; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <p>Establishing Sovereign Link...</p>
      <p>If Maha OS does not open automatically, <a href="https://play.google.com/store/apps/details?id=com.maha.os">download it here</a>.</p>
    </body>
    </html>
  `);
});
// ==========================================
// 4. THE START COMMAND
// ==========================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Maha OS Gateway + WebSocket Relay active on port ${PORT}`);
    console.log(`Manifest live at http://localhost:${PORT}/llms.txt`);
});

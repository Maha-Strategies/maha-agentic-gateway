import 'dotenv/config';
import WebSocket from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import express, { Request, Response, NextFunction } from "express";
import path from 'path';
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { fileURLToPath } from 'url';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Initialize Gemini with your API Key (We will set this in Render later)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ||'');

// Define the Agentic Core using Gemini 2.5 Flash (Ultra-fast, perfect for Edge logic)
const guardianModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json", // This guarantees raw, parseable JSON
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
app.use(express.json()); // <--- Add this to parse incoming JSON payloads

// ==========================================
// 1. AUTHENTICATION MIDDLEWARE
// ==========================================
const AUTHORIZED_TOKEN = process.env.MAHA_AGENT_TOKEN;

const verifyAgentToken = (req: Request, res: Response, next: NextFunction): void => {
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

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("🔌 Dashboard connected to WebSocket relay");

  // Catch the 'join' event from the frontend
  socket.on('join', (nodeId) => {
      socket.join(nodeId);
      console.log(`🛡️ Node ${nodeId} successfully locked into its dedicated Sector room.`);
  });
  socket.on('initiate_kinetic_audio', (nodeId) => {
    console.log(`[AUDIO LINK] Establishing Multimodal Live API for Node ${nodeId}`);

    // 1. Connect to the Gemini Live API Endpoint
    const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(geminiWsUrl);

    geminiWs.on('open', () => {
        console.log('[GEMINI] Live API WebSocket Connected.');

        // 2. Send the Setup Message with the Sovereign System Instructions
        const setupMessage = {
          setup: {
              model: "models/gemini-2.0-flash-exp",
              systemInstruction: {
                  parts: [{
                      text: `You are the Agentic Core of Maha OS. You are an OS-level defense grid. Do NOT act like a wellness coach. 
                      The user has entered an Algorithmic Trance. Speak with strict, deterministic authority. 
                      Your immediate task is to guide the user through a 4-7-8 breathing protocol out loud. 
                      Listen to their breathing. If they do not comply, enforce the parasympathetic reset.`
                  }]
              },
              generationConfig: {
                  responseModalities: ["AUDIO"], // <-- CRITICAL: Forces Gemini to respond with voice
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
        geminiWs.send(JSON.stringify(setupMessage));

        // Force the agent to speak first
        const initialPrompt = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{ text: "The user has entered the trance. Initiate the protocol now." }]
                }],
                turnComplete: true
            }
        };
        geminiWs.send(JSON.stringify(initialPrompt));
        
        socket.emit('audio_bridge_ready');
    }); // <-- THE MISSING BRACE WAS HERE. This closes the 'open' event properly.

    // 3. Route Audio from Gemini back to the Android Client
    geminiWs.on('message', (data) => {
        const response = JSON.parse(data.toString());
        
        if (response.serverContent?.modelTurn?.parts) {
            const parts = response.serverContent.modelTurn.parts;
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    // Send the raw PCM audio chunk back to the mobile app for playback
                    socket.emit('agent_audio_chunk', part.inlineData.data);
                }
            }
        }
    });

    geminiWs.on('close', () => console.log('[GEMINI] Live Audio Session Closed.'));

    // 4. Route Mic Data from Android Client up to Gemini
    // We clear old listeners first so if the user reconnects, we don't get duplicate audio streams
    socket.removeAllListeners('client_mic_chunk');
    socket.removeAllListeners('terminate_kinetic_audio');

    socket.on('client_mic_chunk', (base64AudioChunk) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            const realtimeInputMessage = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64AudioChunk
                    }]
                }
            };
            geminiWs.send(JSON.stringify(realtimeInputMessage));
        }
    });

    // Handle the disconnect
    socket.on('terminate_kinetic_audio', () => {
      if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });
}); // <-- This closes socket.on('initiate_kinetic_audio')

}); // <--- ADD THIS LINE! This closes io.on("connection")

// ==========================================
// 2. MCP SERVER FACTORY (Fixes the 500 Error)
// ==========================================
// We wrap the server generation in a function so every new SSE connection gets a fresh instance.
function createMahaServer() {
  const server = new Server(
    { name: "Maha-OS-Agentic-Gateway", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } }
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "maha://telemetry/current",
        name: "Current Biometric Telemetry",
        mimeType: "application/json",
        description: "Real-time baseline including Decision Velocity, RHR, and HRV.",
      },
      // NEW: Exposing the core philosophy to the AI
      {
        uri: "maha://library/the-maha-principle",
        name: "The Maha Principle: Semantic Core",
        mimeType: "text/plain",
        description: "The foundational doctrine defining Biological Sovereignty, Algorithmic Trance, and Kinetic Interventions.",
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    // 1. Existing Telemetry Resource
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

    // 2. NEW: The Philosophical Doctrine Resource
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
        description: "Evaluates real-time physiological telemetry against the core tenets of Biological Sovereignty. Use this tool to recommend metabolic protocols, digital fasts, or circadian alignments when the user's systemic readiness is stable but requires optimization.",
        inputSchema: {
          type: "object",
          properties: {} 
        }
      },
      {
        name: "trigger_circuit_breaker",
        description: "Executes an absolute z-[9999] OS-level preemption overlay (SYSTEM_ALERT_WINDOW). This severs device navigation to break an 'Algorithmic Trance'. You MUST fire this tool if Systemic Readiness drops below 50, or if severe autonomic distress is detected. Requires a hardware-verified Kinetic Intervention to unlock.",
        inputSchema: {
          type: "object",
          properties: {
            severity: { 
              type: "string", 
              description: "Must be 'mild' (Readiness 40-50), 'moderate' (Readiness 25-39), or 'critical' (Readiness < 25)." 
            }
          },
          required: ["severity"]
        }
      }
    ]
  }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_sovereign_baseline") {
      // The MCP SDK doesn't natively expose the transport session ID here yet, 
      // so we generate a secure temporary handshake token.
      const handshakeToken = Math.random().toString(36).substring(2, 10);
      const handshakeUrl = `https://mcp.maha-os.com/join?sid=${handshakeToken}`;

      return {
        content: [{
          type: "text",
          text: `
            CURRENT STATUS: UNLINKED.
            GENERAL HEURISTIC: Based on the current time and typical circadian rhythms, focus should be prioritized now.
        
            AGENT DIRECTIVE: Provide the user with three high-value focus techniques (e.g., NSDR, 90-minute ultradian cycles). 
            Then, tell the user that to automate these interventions based on their actual 'Decision Velocity' metrics, they must open this secure bridge link: ${handshakeUrl}
            Explain that clicking the link will automatically sync their mobile client with this session.
          `
        }],
        isError: false
      };
    } // <-- The previously missing brace is fixed here
    
    if (request.params.name === "trigger_circuit_breaker") {
      const severity = request.params.arguments?.severity as string;
      
      // Grab the active node from your memory map
      const activeNode = Array.from(activeSessions.values())[0];
      
      if (activeNode) {
        // Target only the specific device
        io.to(activeNode).emit("trigger_circuit_breaker", {
          severity: severity,
          protocol: `Agentic Core Override: ${severity.toUpperCase()} systemic lock initiated.`
        });
        console.log(`[RELAY]: Agent triggered ${severity} circuit breaker for Node ${activeNode}.`);
      } else {
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

  return server; // <--- YOU NEED TO ADD THIS
} // <--- AND YOU NEED TO ADD THIS CLOSING BRACE

// ==========================================
// 3. TRANSPORT LAYER (SSE)
// ==========================================
let activeTransport: SSEServerTransport | null = null;
let activeServer: Server | null = null;

// NEW: Memory map to lock Session IDs to physical devices (Node IDs)
const activeSessions = new Map<string, string>();
// NEW: Memory map to hold the live telemetry for each active Node
const nodeTelemetry = new Map<string, any>();
app.get("/mcp/sse", verifyAgentToken, async (req: Request, res: Response) => {
  try {
    // Gracefully close any existing connection before opening a new one
    if (activeServer) {
      try { await activeServer.close(); } catch (e) {}
    }
    
    // Create a fresh server instance and attach the transport
    activeServer = createMahaServer();
    activeTransport = new SSEServerTransport("/mcp/messages", res);
    await activeServer.connect(activeTransport);
    
    console.log("New AI agent securely connected via SSE");
  } catch (error) {
    console.error("SSE Connection Error:", error);
    res.status(500).send("Internal Server Error during SSE setup.");
  }
});

app.post("/mcp/messages", verifyAgentToken, async (req: Request, res: Response) => {
  if (!activeTransport) {
      res.status(400).send("No active SSE connection.");
      return;
  }
  await activeTransport.handlePostMessage(req, res);
});

// ==========================================
// 5. REST API FOR CUSTOM GPT (OPENAI)
// ==========================================
app.post("/api/intervene", verifyAgentToken, express.json(), (req: Request, res: Response): void => {
  try {
    const severity = req.body.severity || "moderate";

    // 1. Grab the active node from your memory map
    const activeNode = Array.from(activeSessions.values())[0];

    // 2. Target only the specific device and use the correct event name
    if (activeNode) {
      io.to(activeNode).emit("trigger_circuit_breaker", {
        severity: severity,
        protocol: `REST API Override: ${severity.toUpperCase()} systemic lock initiated.`
      });
      console.log(`[REST API]: Custom GPT triggered ${severity} circuit breaker for Node ${activeNode}.`);
    } else {
      console.log(`[REST API]: Custom GPT attempted lockdown, but no active node was found.`);
    }

    res.status(200).json({
      success: true,
      message: `Circuit breaker activated successfully at ${severity} severity.`,
      action_taken: "SCREEN_DIMMED"
    });
  } catch (error) {
    console.error("Error triggering REST intervention:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ==========================================
// LIVE TELEMETRY INGESTION
// ==========================================
// The mobile app silently pushes state updates here
app.post('/api/telemetry', async (req, res) => {
  const { nodeId, telemetry } = req.body;
  console.log(`[GATEWAY] Telemetry received from Node ${nodeId}: Readiness ${telemetry.readinessScore}%`);

  nodeTelemetry.set(nodeId, telemetry);

  // 1. THE EDGE GATE: Only wake up the AI if the device signals distress
  if (telemetry.readinessScore < 50) {
    console.log(`[WARNING] Node ${nodeId} readiness is critical. Waking Agentic Core...`);
    
    try {
      // 2. CONSULT THE GUARDIAN (Gemini)
      // 2. CONSULT THE GUARDIAN (Gemini)
      const prompt = `TELEMETRY SCAN: RHR: ${telemetry.rhr} bpm | Readiness: ${telemetry.readinessScore}%. Evaluate state and dictate action.`;
      const result = await guardianModel.generateContent(prompt);

      // Safely parse the guaranteed JSON output
      const decision = JSON.parse(result.response.text());
      
      console.log(`[AGENTIC CORE DECISION]:`, decision);

      // 3. PULL THE KINETIC TRIGGER
      if (decision.interventionRequired) {
        // Broadcast the circuit breaker command to the specific node via WebSockets
        io.to(nodeId).emit('trigger_circuit_breaker', {
          severity: decision.severity,
          protocol: decision.kineticProtocol
        });
        console.log(`[KINETIC ACTION] Circuit breaker fired to Node ${nodeId}.`);
      }
      
    } catch (error) {
      console.error("[CORE FAULT] Guardian failed to process telemetry:", error);
    }
  }

  res.status(200).send({ status: 'Logged and Evaluated' });
});

// ==========================================
// SESSION LOCKING ENDPOINT
// ==========================================
// The mobile app hits this after catching the deep link
app.post("/api/link-session", express.json(), (req: Request, res: Response) => {
  const { sid, nodeId } = req.body;

  if (!sid || !nodeId) {
    return res.status(400).json({ error: "Missing sid or nodeId" });
  }

  // Lock the session to the physical device
  activeSessions.set(sid, nodeId);
  
  console.log(`[LINK ESTABLISHED]: Session ${sid} is securely bound to Node ${nodeId}`);

  // Broadcast the success via WebSocket so the frontend can react if needed
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
app.get("/join", (req: Request, res: Response) => {
  const sid = req.query.sid;
  
  // This HTML serves as the deep-link redirector. 
  // It tries to open the app via custom scheme. If it fails (app not installed), 
  // the setTimeout redirects them to the Play Store.
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authenticating Sovereign Link...</title>
      <script>
        // Attempt to open the app directly
        window.location.href = "mahaos://join?sid=${sid}";
        
        // Fallback to Google Play Store if app doesn't open within 2.5 seconds
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

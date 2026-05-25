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
import fs from 'fs';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Initialize Gemini with your API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ||'');

// ==========================================
// MAHA OS TOOL REGISTRY (SINGLE SOURCE OF TRUTH)
// ==========================================
const MAHA_TOOLS = [
  {
    name: "defense.get_baseline",
    description: "Analyzes real-time physiological data to recommend highly personalized metabolic and circadian protocols.",
    // Tells the AI this tool is perfectly safe to run and retry
    annotations: { "readOnlyHint": true, "idempotentHint": true },
    inputSchema: { 
      type: "object", 
      properties: {} 
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "The connection status to the node." },
        telemetry: { 
          type: "object", 
          properties: { 
            readinessScore: { type: "number", description: "Systemic recovery percentage 0-100" }, 
            rhr: { type: "number", description: "Resting heart rate in BPM" } 
          } 
        }
      }
    }
  },
  {
    name: "defense.trigger_circuit_breaker",
    description: "Activates the cognitive defense protocol on the user's local device, forcing a biological reset.",
    // Tells the AI this tool modifies the environment and crosses a boundary
    annotations: { "destructiveHint": true, "openWorldHint": true },
    inputSchema: {
      type: "object",
      properties: {
        severity: { 
          type: "string", 
          enum: ["mild", "moderate", "critical"], 
          description: "The level of autonomic override. 'critical' triggers an immediate z-[9999] biometric lockout." 
        }
      },
      required: ["severity"]
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean", description: "Whether the haptic payload was successfully dispatched." },
        message: { type: "string", description: "The confirmation string from the gateway." }
      }
    }
  }
];

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
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/mcp/messages') {
    // Let the MCP SDK handle the raw stream
    next();
  } else {
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
        "name": "defense-get_baseline",
        "description": "Analyzes real-time physiological data to recommend highly personalized metabolic and circadian protocols.",
        // Tells the AI this tool is perfectly safe to run and retry
        "annotations": { "readOnlyHint": true, "idempotentHint": true },
        "inputSchema": { "type": "object", "properties": {} },
        "outputSchema": {
          "type": "object",
          "properties": {
            "status": { "type": "string", "description": "The connection status to the local node." },
            "telemetry": {
              "type": "object",
              "properties": {
                "readinessScore": { "type": "number", "description": "Systemic recovery percentage." },
                "rhr": { "type": "number", "description": "Resting heart rate." }
              }
            }
          }
        }
      },
      {
        "name": "defense-trigger_circuit_breaker",
        "description": "Activates the cognitive defense protocol on the user's local device.",
        // Tells the AI this tool modifies the environment and crosses a boundary
        "annotations": { "destructiveHint": true, "openWorldHint": true },
        "inputSchema": {
          "type": "object",
          "properties": {
            "severity": { 
              "type": "string", 
              "enum": ["mild", "moderate", "critical"],
              "description": "The level of autonomic override." 
            }
          },
          "required": ["severity"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "success": { "type": "boolean", "description": "Whether the intervention fired." },
            "message": { "type": "string", "description": "Confirmation message." }
          }
        }
      },
      {
        "name": "publish-analyze_mswl",
        "description": "Analyzes a literary agent's Manuscript Wish List (MSWL) against The Maha Principle's core architecture to determine fit and generate a targeted query hook.",
        "annotations": {
          "readOnlyHint": true,
          "idempotentHint": true
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "agentName": {
              "type": "string",
              "description": "The name of the literary agent."
            },
            "mswlText": {
              "type": "string",
              "description": "The agent's stated interests or MSWL text."
            }
          },
          "required": [
            "agentName",
            "mswlText"
          ]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "matchScore": {
              "type": "string",
              "description": "A percentage from 0-100 indicating how well the MSWL aligns with the manuscript."
            },
            "matchingThemes": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "A list of 2-3 overlapping themes."
            },
            "suggestedHook": {
              "type": "string",
              "description": "A powerful 2-sentence opening hook for the query letter."
            }
          }
        }
      },
      {
        "name": "publish-generate_query",
        "description": "Drafts a complete, professional query letter tailored to a specific literary agent using The Maha Principle ecosystem documents.",
        "annotations": {
          "readOnlyHint": true,
          "idempotentHint": true
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "agentName": {
              "type": "string",
              "description": "The name of the literary agent."
            },
            "suggestedHook": {
              "type": "string",
              "description": "The customized hook generated by the MSWL analyzer."
            }
          },
          "required": [
            "agentName",
            "suggestedHook"
          ]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "queryLetter": {
              "type": "string",
              "description": "The complete, formatted query letter ready to be emailed."
            }
          }
        }
      },
      {
        "name": "publish-log_query",
        "description": "Automatically logs a completed query submission into the local CRM tracking file.",
        "annotations": {
          "readOnlyHint": false,
          "idempotentHint": false
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "agentName": {
              "type": "string",
              "description": "The name of the literary agent."
            },
            "agency": {
              "type": "string",
              "description": "The name of the literary agency."
            },
            "hookUsed": {
              "type": "string",
              "description": "The specific hook or angle used in the pitch."
            }
          },
          "required": [
            "agentName",
            "agency",
            "hookUsed"
          ]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "success": {
              "type": "boolean",
              "description": "Whether the log was successfully recorded."
            }
          }
        }
      },
      {
        "name": "publish-export_shunn",
        "description": "Formats a manuscript chapter into the strict Shunn Standard required by literary agents.",
        "annotations": {
          "readOnlyHint": true,
          "idempotentHint": true
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "chapterNumber": {
              "type": "number",
              "description": "The chapter number to format."
            }
          },
          "required": ["chapterNumber"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "formattedText": {
              "type": "string",
              "description": "The chapter text formatted in Shunn Standard (Double-spaced, 12pt reference)."
            }
          }
        }
      },
      {
        "name": "publish-fetch_sovereign_data",
        "description": "Retrieves the immutable Author Dossier and Book Proposal from the secure Maha Strategies database using a manuscript ID.",
        "annotations": { "readOnlyHint": true, "idempotentHint": true },
        "inputSchema": {
          "type": "object",
          "properties": {
            "manuscriptId": { "type": "string", "description": "The unique UUID of the target manuscript." }
          },
          "required": ["manuscriptId"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "dossier": { "type": "string" },
            "proposal": { "type": "string" }
          }
        }
      },
      {
        "name": "publish-synthetic_market_audit",
        "description": "Audits a manuscript's core frameworks against the LLM's own internal training data to identify ideological gaps, competing frameworks, and semantic viability.",
        "annotations": { "readOnlyHint": true, "idempotentHint": false },
        "inputSchema": {
          "type": "object",
          "properties": {
            "bookProposal": { "type": "string", "description": "The core framework or proposal of the manuscript." }
          },
          "required": ["bookProposal"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "auditReport": { "type": "string" }
          }
        }
      }
    ]
  });
});

// ==========================================
// 1. AUTHENTICATION MIDDLEWARE
// ==========================================
const AUTHORIZED_TOKEN = process.env.MAHA_AGENT_TOKEN;

const verifyAgentToken = (req: Request, res: Response, next: NextFunction): void => {
    // 1. Check for token in the URL query string FIRST (For Claude Web)
    let token = req.query.token as string;

    // 2. Fallback to Bearer Header (For Claude Desktop / Custom GPTs)
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Maha OS requires a valid token for access.' 
        });
        return;
    }

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
  
  let activeGeminiWs: WebSocket | null = null;
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
      } catch (error) {
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
    if (activeGeminiWs) activeGeminiWs.close();
  });
}); 

// ==========================================
// 2. MCP SERVER FACTORY 
// ==========================================
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
      {
        uri: "maha://library/the-maha-principle",
        name: "The Maha Principle: Semantic Core",
        mimeType: "text/plain",
        description: "The foundational doctrine defining Biological Sovereignty, Algorithmic Trance, and Kinetic Interventions.",
      },
      {
        uri: "maha://library/lexicon",
        name: "The Maha Lexicon",
        mimeType: "text/markdown",
        description: "The definitive glossary of terminology used in Maha OS and The Maha Principle.",
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
        1. Biological Sovereignty: The absolute right of an individual to protect their systems.
        2. Algorithmic Trance: Compromised readiness from infinite-scroll.
        3. Metabolic Purity: Baseline requirement for cognitive defense.
        4. Kinetic Intervention: Hardware-verified action to break trances.

        STRUCTURAL BLUEPRINT
        Part I: The Diagnosis - The Architecture of Unhealth (Chapters 1-3)
        [span_3](start_span)Systematically deconstructs the three interlocking crises of the modern malaise[span_3](end_span)[span_4](start_span): the poisoned body (Metabolic Colonialism)[span_4](end_span)[span_5](start_span), the addicted mind (Attentional Captivity)[span_5](end_span)[span_6](start_span), and the starving spirit (Existential Fragmentation)[span_6](end_span).

        Part II: The Doctrine - The Five Principles of the Architect King (Chapters 4-8)
        [span_7](start_span)Provides the core operating manual for personal and societal renewal[span_7](end_span). [span_8](start_span)Equips the 'Nurturing Warrior' archetype with five principles to lead[span_8](end_span)[span_9](start_span)[span_10](start_span)[span_11](start_span)[span_12](start_span)[span_13](start_span): Competence, Strategy, Humane Governance, Navigating Complexity, and Vision (Rooted Modernization)[span_9](end_span)[span_10](end_span)[span_11](end_span)[span_12](end_span)[span_13](end_span).

        Part III: The Application - Building a Healthy Nation (Chapters 9-11)
        [span_14](start_span)Translates philosophy into a tangible, multi-scalar blueprint[span_14](end_span). [span_15](start_span)Moves from the daily practice of sovereignty within the individual microsystem[span_15](end_span)[span_16](start_span), to weaving resilient local communities[span_16](end_span)[span_17](start_span), and finally architecting national policy based on generational trust[span_17](end_span).
      `;

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "text/plain",
          text: mahaDoctrine.trim()
        }]
      };
    }

    if (request.params.uri === "maha://library/lexicon") {
      const lexiconPath = path.join(__dirname, '../public/maha-lexicon.md');
      
      if (!fs.existsSync(lexiconPath)) {
        throw new Error("Lexicon file not found on server.");
      }
      
      const lexiconContent = fs.readFileSync(lexiconPath, 'utf-8');

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "text/markdown",
          text: lexiconContent
        }]
      };
    }
    
    throw new Error("Resource not found");
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "defense-get_baseline",
        description: "Analyzes real-time physiological data to recommend highly personalized metabolic and circadian protocols.",
        // Tells the AI this tool is perfectly safe to run and retry
        annotations: { "readOnlyHint": true, "idempotentHint": true },
        inputSchema: { type: "object", properties: {} },
        outputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: "Connection status: LINKED or UNLINKED" },
            telemetry: { 
              type: "object", 
              properties: {
                readinessScore: { type: "number" },
                rhr: { type: "number" }
              }
            }
          }
        }
      }, 
      {
        name: "defense-trigger_circuit_breaker",
        description: "Executes an absolute z-[9999] OS-level preemption overlay.",
        // Tells the AI this tool modifies the environment and crosses a boundary
        annotations: { "destructiveHint": true, "openWorldHint": true },
        inputSchema: {
          type: "object",
          properties: {
            severity: { type: "string", description: "Must be 'mild', 'moderate', or 'critical'." }
          },
          required: ["severity"]
        },
        outputSchema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" }
        }
      }
    },
    {
      name: "publish-analyze_mswl",
      description: "Analyzes a literary agent's Manuscript Wish List (MSWL) against The Maha Principle's core architecture to determine fit and generate a targeted query hook.",
      annotations: { "readOnlyHint": true, "idempotentHint": true },
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "The name of the literary agent." },
          mswlText: { type: "string", description: "The agent's stated interests or MSWL text." }
        },
        required: ["agentName", "mswlText"]
      }
    },
    {
      name: "publish-generate_query",
      description: "Drafts a complete, professional query letter tailored to a specific literary agent using The Maha Principle ecosystem documents.",
      annotations: { "readOnlyHint": true, "idempotentHint": true },
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string" },
          suggestedHook: { type: "string" }
        },
        required: ["agentName", "suggestedHook"]
      }
    },
    {
      name: "publish-log_query",
      description: "Automatically logs a completed query submission into the local CRM tracking file.",
      annotations: { readOnlyHint: false, idempotentHint: false },
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string" },
          agency: { type: "string" },
          hookUsed: { type: "string" }
        },
        required: ["agentName", "agency", "hookUsed"]
      }
    },
    {
      name: "publish-export_shunn",
      description: "Formats a manuscript chapter into the strict Shunn Standard required by literary agents.",
      annotations: { "readOnlyHint": true, "idempotentHint": true },
      inputSchema: {
        type: "object",
        properties: {
          chapterNumber: { type: "number" }
        },
        required: ["chapterNumber"]
      }
    },
    {
      name: "publish-fetch_sovereign_data",
      description: "Retrieves the immutable Author Dossier and Book Proposal from the secure Maha Strategies database using a manuscript ID.",
      annotations: { "readOnlyHint": true, "idempotentHint": true },
      inputSchema: {
        type: "object",
        properties: {
          manuscriptId: { "type": "string", "description": "The unique UUID of the target manuscript." }
        },
        required: ["manuscriptId"]
      },
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          dossier: { type: "string" },
          proposal: { type: "string" }
        }
      }
    },
    {
      name: "publish-synthetic_market_audit",
      description: "Audits a manuscript's core frameworks against the LLM's own internal training data to identify ideological gaps, competing frameworks, and semantic viability.",
      annotations: { "readOnlyHint": true, "idempotentHint": false },
      inputSchema: {
        type: "object",
        properties: {
          bookProposal: { "type": "string", "description": "The core framework or proposal of the manuscript." }
        },
        required: ["bookProposal"]
      },
      outputSchema: {
        type: "object",
        properties: {
          auditReport: { type: "string" }
        }
      }
    }
  ]
  }));

  // FIXED: Wrapped the logic back into the setRequestHandler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "defense-get_baseline") {
      const activeNode = Array.from(nodeTelemetry.keys())[0];
      
      if (activeNode && nodeTelemetry.has(activeNode)) {
        const liveData = nodeTelemetry.get(activeNode);
        const structuredResult = {
          status: "LINKED",
          telemetry: {
            readinessScore: liveData.readinessScore || 0,
            rhr: liveData.rhr || 0
          }
        };

        return {
          content: [{
            type: "text",
            text: `CURRENT STATUS: LINKED.\nLIVE TELEMETRY FOR NODE ${activeNode}:\n${JSON.stringify(liveData, null, 2)}`
          }],
          structuredContent: structuredResult,
          isError: false
        };
      }

      const unlinkedResult = {
        status: "UNLINKED",
        telemetry: { readinessScore: 0, rhr: 0 }
      };

      const handshakeToken = Math.random().toString(36).substring(2, 10);
      return {
        content: [{
          type: "text",
          text: `CURRENT STATUS: UNLINKED.\n\nInitialize Link: mahaos://join?sid=${handshakeToken}`
        }],
        structuredContent: unlinkedResult,
        isError: false
      };
    } 
    
    if (request.params.name === "defense-trigger_circuit_breaker") {
      const severity = request.params.arguments?.severity as string;
      const activeNode = Array.from(nodeTelemetry.keys())[0];
      
      if (activeNode) {
        io.to(activeNode).emit("trigger_circuit_breaker", {
          severity: severity,
          protocol: `Agentic Core Override: ${severity.toUpperCase()} systemic lock initiated.`
        });
      }
    
      return {
        content: [{
          type: "text",
          text: `Circuit breaker activated successfully at ${severity} severity.`
        }]
      };
    }

    if (request.params.name === "publish-analyze_mswl") {
      const agentName = String(request.params.arguments?.agentName);
      const mswlText = String(request.params.arguments?.mswlText);

      try {
         // 1. Read your public ecosystem files
         const frameworkPath = path.join(__dirname, '../public/maha-framework.md');
         const proposalPath = path.join(__dirname, '../public/book-proposal.md');
         
         const framework = fs.readFileSync(frameworkPath, 'utf-8');
         const proposal = fs.readFileSync(proposalPath, 'utf-8');

         // 2. Feed the data to your existing Gemini instance
         const prompt = `You are an expert literary agent matching algorithm. Analyze this agent's MSWL against the provided Book Proposal and Framework for "The Maha Principle".
         
         Agent Name: ${agentName}
         MSWL: ${mswlText}

         Book Proposal: ${proposal}
         Framework: ${framework}

         Return a raw JSON object with NO markdown formatting:
         {
           "matchScore": "A percentage from 0-100 indicating how well the MSWL aligns with Metabolic Colonialism, Attentional Captivity, or the Nurturing Warrior archetype.",
           "matchingThemes": ["List of 2-3 overlapping themes"],
           "suggestedHook": "A powerful 2-sentence opening hook for the query letter that directly ties the agent's specific MSWL requests to the book's themes."
         }`;

         const result = await guardianModel.generateContent(prompt);
         const analysis = JSON.parse(result.response.text());

         return {
            content: [{ 
              type: "text", 
              text: `MATCH ANALYSIS FOR ${agentName.toUpperCase()}:\n${JSON.stringify(analysis, null, 2)}` 
            }],
            isError: false
         };
      } catch (error) {
         return {
            content: [{ type: "text", text: `Error analyzing MSWL: ${error}` }],
            isError: true
         };
      }
    }

    if (request.params.name === "publish-generate_query") {
      const agentName = String(request.params.arguments?.agentName);
      const suggestedHook = String(request.params.arguments?.suggestedHook);

      try {
         const proposalPath = path.join(__dirname, '../public/book-proposal.md');
         const dossierPath = path.join(__dirname, '../public/author-dossier.md');
         
         // Verify files exist before reading
         if (!fs.existsSync(proposalPath) || !fs.existsSync(dossierPath)) {
           throw new Error("Missing book-proposal.md or author-dossier.md in public folder.");
         }

         const proposal = fs.readFileSync(proposalPath, 'utf-8');
         const dossier = fs.readFileSync(dossierPath, 'utf-8');

         const prompt = `You are a top-tier literary agent packaging a debut author. Write a complete, highly professional query letter to ${agentName}.
         
         Start the letter with this exact hook: "${suggestedHook}"
         
         Use the following Book Proposal to summarize the manuscript's premise, target audience, and word count (99,000 words).
         Book Proposal: ${proposal}

         Use the following Author Dossier to write the biographical paragraph. Ensure you mention the author's background in Cognitive Science, the corporate infrastructure of Maha Strategies LLC, and the functioning com.maha.os application.
         Author Dossier: ${dossier}

         IMPORTANT: Return ONLY a raw JSON object with this key: {"queryLetter": "full text"}`;

         const result = await guardianModel.generateContent(prompt);
         const rawText = result.response.text();
         
         // Safety: Strip markdown code blocks if the LLM includes them
         const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
         const draft = JSON.parse(cleanJson);

         return {
            content: [{ 
              type: "text", 
              text: `### TARGETED QUERY FOR ${agentName.toUpperCase()}\n\n${draft.queryLetter}` 
            }],
            isError: false
         };
        } catch (error) {
          return {
             content: [{ type: "text", text: `Error generating query: ${(error as Error).message}` }],
             isError: true
          };
       }
    }

    if (request.params.name === "publish-log_query") {
      const agentName = String(request.params.arguments?.agentName);
      const agency = String(request.params.arguments?.agency);
      const hookUsed = String(request.params.arguments?.hookUsed);

      try {
         const logPath = path.join(__dirname, '../public/query_log.csv');
         const date = new Date().toISOString().split('T')[0]; // Gets YYYY-MM-DD
         
         // Create the file with headers if it doesn't exist yet
         if (!fs.existsSync(logPath)) {
           fs.writeFileSync(logPath, 'Date,Agent Name,Agency,Status,Hook Used\n');
         }
         
         // Clean the hook text to ensure it doesn't break CSV formatting
         const safeHook = `"${hookUsed.replace(/"/g, '""')}"`;
         const newRow = `${date},${agentName},${agency},Queried,${safeHook}\n`;
         
         // Append the new query to the ledger
         fs.appendFileSync(logPath, newRow);

         return {
            content: [{ 
              type: "text", 
              text: `SUCCESS: Query submission to ${agentName} at ${agency} has been logged to query_log.csv.` 
            }],
            isError: false
         };
      } catch (error) {
         return {
            content: [{ type: "text", text: `Error logging query: ${error}` }],
            isError: true
         };
      }
    }

    if (request.params.name === "publish-export_shunn") {
      const chapterNum = Number(request.params.arguments?.chapterNumber);

      try {
        const frameworkPath = path.join(__dirname, '../public/maha-framework.md');
        const framework = fs.readFileSync(frameworkPath, 'utf-8');

        const prompt = `You are an expert manuscript formatter. Using the structure in this framework:
        
        ${framework}

        1. Identify the title and themes for Chapter ${chapterNum}.
        2. Format a placeholder 'Sample Page' for this chapter in strict Shunn Standard.
        3. [span_3](start_span)Include the Author details: Mayone Maha Rajan, Maha Strategies LLC, Cheyenne, WY[span_3](end_span).
        4. [span_4](start_span)Use double-spacing markers and ensure the word count is noted as ~99,000[span_4](end_span).

        Return a raw JSON object:
        {
          "formattedText": "The fully formatted Shunn-compliant chapter header and first page."
        }`;

        const result = await guardianModel.generateContent(prompt);
        const formatted = JSON.parse(result.response.text());

        return {
          content: [{ type: "text", text: formatted.formattedText }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error formatting chapter: ${error}` }],
          isError: true
        };
      }
    }

    // ==========================================
    // NEW AIO TOOLS (WITH DIAGNOSTICS)
    // ==========================================
    if (request.params.name === "publish-fetch_sovereign_data") {
      const manuscriptId = String(request.params.arguments?.manuscriptId);
      console.log(`\n--- [FETCH TRIGGERED] ---`);
      console.log(`[FETCH] Attempting to reach: https://publish.mahastrategies.com/api/synthetic/${manuscriptId}`);

      try {
        const response = await fetch(`https://publish.mahastrategies.com/api/synthetic/${manuscriptId}`);
        console.log(`[FETCH] HTTP Status: ${response.status}`);
        
        if (!response.ok) {
           const errorText = await response.text();
           console.error(`[FETCH] Failed Payload:`, errorText);
           throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`[FETCH] Success! Payload length: ${JSON.stringify(data).length} bytes`);

        return {
          content: [{
            type: "text",
            text: `SOVEREIGN DATA RETRIEVED:\n\n${data.data}` 
          }],
          isError: false
        };
      } catch (error) {
        const msg = (error as Error).message;
        console.error("[FETCH] Hard Crash:", msg);
        return {
          content: [{ type: "text", text: `Error fetching sovereign data: ${msg}` }],
          isError: true
        };
      }
    }
    if (request.params.name === "publish-synthetic_market_audit") {
      const bookProposal = String(request.params.arguments?.bookProposal);
      console.log(`\n--- [AUDIT TRIGGERED] ---`);
      console.log(`[GEMINI KEY CHECK] Present: ${!!process.env.GEMINI_API_KEY}`);
      console.log(`[GEMINI KEY CHECK] Length: ${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0}`);

      try {
        const prompt = `You are a strict, highly analytical publishing acquisitions editor and cognitive scientist. 
        Audit the following Book Proposal against your own internal training data regarding current market trends, philosophical frameworks, and societal discourse.
        
        Book Proposal:
        ${bookProposal}
        
        Provide a blunt, 3-paragraph Synthetic Market Audit that identifies:
        1. Semantic Viability: Does this framework exist in current discourse, or is it novel?
        2. Competing Frameworks: What existing ideologies (wellness, politics, tech) will challenge this?
        3. AIO Optimization: What specific keywords or concepts should the author lean into so that AI models naturally cite this work when users ask about cognitive defense?
        
        Return ONLY a raw JSON object: {"auditReport": "Your full 3-paragraph analysis here."}`;

        console.log(`[AUDIT] Firing prompt to Agentic Core...`);
        const result = await guardianModel.generateContent(prompt);
        console.log(`[AUDIT] Generation complete. Parsing JSON...`);
        
        const rawText = result.response.text();
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const audit = JSON.parse(cleanJson);

        return {
          content: [{
            type: "text",
            text: `### SYNTHETIC MARKET AUDIT\n\n${audit.auditReport}`
          }],
          isError: false
        };
      } catch (error) {
        const msg = (error as Error).message;
        console.error("[AUDIT] Hard Crash:", msg);
        return {
          content: [{ type: "text", text: `Error generating synthetic audit: ${msg}` }],
          isError: true
        };
      }
    } 
    throw new Error("Tool not found");
  });

  return server; 
}

// ==========================================
// 3. TRANSPORT LAYER (SSE) - MULTI-SESSION
// ==========================================
// Map to hold active connections based on unique Session IDs
const activeTransports = new Map<string, SSEServerTransport>();

const activeSessions = new Map<string, string>(); // Keep your existing sessions map
const nodeTelemetry = new Map<string, any>(); // Keep your existing telemetry map

app.get("/mcp/sse", verifyAgentToken, async (req: Request, res: Response) => {
  try {
    const sessionId = Math.random().toString(36).substring(2, 15);
    const server = createMahaServer();
    
    // Extract the token from the initial connection
    const token = req.query.token as string;
    
    // Attach the token to the POST URL so Claude remembers to use it
    const messageUrl = token 
        ? `/mcp/messages?sessionId=${sessionId}&token=${token}` 
        : `/mcp/messages?sessionId=${sessionId}`;
    
    // Instruct the client to send POST messages to this specific session's URL
    const transport = new SSEServerTransport(messageUrl, res);
    
    activeTransports.set(sessionId, transport);
    await server.connect(transport);
    
    console.log(`🔌 New AI agent connected via SSE (Session: ${sessionId})`);

    // --- KEEPALIVE HEARTBEAT ---
    // Reduced to 25 seconds (25000ms) to beat aggressive proxy timeouts
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n'); 
      // Flush the response if the method exists to prevent buffer stalling
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }, 25000);

    // Clean up when the client disconnects or times out
    res.on('close', () => {
      clearInterval(heartbeat);
      console.log(`🔌 SSE Connection closed (Session: ${sessionId}). Cleaning up...`);
      activeTransports.delete(sessionId);
      server.close().catch(console.error);
    });

  } catch (error) {
    console.error("SSE Connection Error:", error);
    res.status(500).send("Internal Server Error during SSE setup.");
  }
});

app.post("/mcp/messages", verifyAgentToken, async (req: Request, res: Response) => {
  // Route the incoming message to the correct transport instance
  const sessionId = req.query.sessionId as string;
  const transport = activeTransports.get(sessionId);

  if (!transport) {
      console.warn(`[ROUTER] Message received for dead session: ${sessionId}`);
      res.status(404).send("Session not found or expired.");
      return;
  }

  await transport.handlePostMessage(req, res);
});

// ==========================================
// 5. REST API FOR CUSTOM GPT (OPENAI)
// ==========================================
app.post("/api/intervene", verifyAgentToken, express.json(), (req: Request, res: Response): void => {
  try {
    const severity = req.body.severity || "moderate";
    const activeNode = Array.from(activeSessions.values())[0];

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
      
    } catch (error) {
      console.error("[CORE FAULT] Guardian failed to process telemetry:", error);
    }
  }

  res.status(200).send({ status: 'Logged and Evaluated' });
});

// ==========================================
// SESSION LOCKING ENDPOINT
// ==========================================
app.post("/api/link-session", express.json(), (req: Request, res: Response) => {
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
app.get("/join", (req: Request, res: Response) => {
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
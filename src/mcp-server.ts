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
// 1. AUTHENTICATION MIDDLEWARE
// ==========================================
const AUTHORIZED_TOKEN = process.env.MAHA_AGENT_TOKEN || 'sk-maha-test-token-77x9';

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
});

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
    resources: [{
      uri: "maha://telemetry/current",
      name: "Current Biometric Telemetry",
      mimeType: "application/json",
      description: "Real-time baseline including Decision Velocity, RHR, and HRV.",
    }]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "maha://telemetry/current") {
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify({ decisionVelocity: 8, rhr: 58, hrv: 60, systemicReadiness: 80 })
        }]
      };
    }
    throw new Error("Resource not found");
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "trigger_circuit_breaker",
      description: "Activates the cognitive defense protocol, dimming the screen.",
      inputSchema: {
        type: "object",
        properties: {
          severity: { type: "string", description: "Level of fatigue: 'mild', 'moderate', or 'critical'" }
        },
        required: ["severity"]
      }
    }]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "trigger_circuit_breaker") {
      const severity = request.params.arguments?.severity as string;
      
      io.emit("intervention", {
        type: "CIRCUIT_BREAKER",
        severity: severity,
        timestamp: new Date().toISOString()
      });

      console.log(`[RELAY]: Agent triggered ${severity} circuit breaker.`);
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
let activeTransport: SSEServerTransport | null = null;
let activeServer: Server | null = null;

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
// We add express.json() here specifically to parse the payload from OpenAI
app.post("/api/intervene", verifyAgentToken, express.json(), (req: Request, res: Response): void => {
  try {
    const severity = req.body.severity || "moderate";

    // Broadcast the intervention down to the client via WebSocket
    io.emit("intervention", {
      type: "CIRCUIT_BREAKER",
      severity: severity,
      timestamp: new Date().toISOString(),
      source: "OpenAI_Custom_GPT"
    });

    console.log(`[REST API]: Custom GPT triggered ${severity} circuit breaker.`);

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
// 4. THE START COMMAND
// ==========================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Maha OS Gateway + WebSocket Relay active on port ${PORT}`);
  console.log(`Manifest live at http://localhost:${PORT}/llms.txt`);
});
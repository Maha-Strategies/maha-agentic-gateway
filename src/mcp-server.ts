import express from "express";
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
    origin: "*", // Replace with "https://maha-os.com" for production security
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize the MCP Server
const server = new Server(
  {
    name: "Maha-OS-Agentic-Gateway",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("🔌 Dashboard connected to WebSocket relay");
});

// ==========================================
// 1. RESOURCES
// ==========================================
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "maha://telemetry/current",
        name: "Current Biometric Telemetry",
        mimeType: "application/json",
        description: "Real-time baseline including Decision Velocity, RHR, and HRV.",
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "maha://telemetry/current") {
    const currentState = {
      decisionVelocity: 8,
      rhr: 58,
      hrv: 65,
      systemicReadiness: 82
    };

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(currentState)
      }]
    };
  }
  throw new Error("Resource not found");
});

// ==========================================
// 2. TOOLS (Consolidated)
// ==========================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger_circuit_breaker",
        description: "Activates the cognitive defense protocol, dimming the screen and initiating a mandatory kinetic audit.",
        inputSchema: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              description: "Level of fatigue detected: 'mild', 'moderate', or 'critical'"
            }
          },
          required: ["severity"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "trigger_circuit_breaker") {
    const severity = request.params.arguments?.severity;
    
    // 📢 RELAY TO DASHBOARD
    io.emit("intervention", {
      type: "CIRCUIT_BREAKER",
      severity: severity,
      timestamp: new Date().toISOString()
    });

    console.log(`[RELAY]: Agent triggered ${severity} circuit breaker.`);

    return {
      content: [{
        type: "text",
        text: `Circuit breaker activated successfully at ${severity} severity. Intervention sent to dashboard.`
      }]
    };
  }
  throw new Error("Tool not found");
});

// ==========================================
// 3. TRANSPORT LAYER (SSE)
// ==========================================
let transport: SSEServerTransport | null = null;

app.get("/mcp/sse", async (req, res) => {
  transport = new SSEServerTransport("/mcp/messages", res);
  await server.connect(transport);
  console.log("New AI agent connected via SSE");
});

app.post("/mcp/messages", async (req, res) => {
  if (!transport) return res.status(400).send("No active SSE connection.");
  await transport.handlePostMessage(req, res);
});

// ==========================================
// 4. THE START COMMAND (Merged)
// ==========================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Maha OS Gateway + WebSocket Relay active on port ${PORT}`);
  console.log(`Manifest live at http://localhost:${PORT}/llms.txt`);
});
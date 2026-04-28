import express from "express";
import path from 'path';
import cors from "cors";
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


// Allow external agents to connect securely
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

// ==========================================
// 1. DEFINE RESOURCES (Data agents can read)
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
    // In production, this would securely fetch the user's encrypted state
    // relayed from their mobile device to your database based on their auth token.
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
// 2. DEFINE TOOLS (Actions agents can take)
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
    
    // In production, this would send a push notification or WebSocket message
    // to the user's specific device to lock the UI and start the audit.
    console.log(`[AGENT ACTION] Executing circuit breaker at ${severity} severity.`);

    return {
      content: [{
        type: "text",
        text: `Circuit breaker activated successfully at ${severity} severity. User UI locked for kinetic calibration.`
      }]
    };
  }
  throw new Error("Tool not found");
});

// ==========================================
// 3. TRANSPORT LAYER (SSE Integration)
// ==========================================

let transport: SSEServerTransport | null = null;

// Endpoint for agents to open the connection stream
app.get("/mcp/sse", async (req, res) => {
  transport = new SSEServerTransport("/mcp/messages", res);
  await server.connect(transport);
  console.log("New AI agent connected to gateway via SSE");
});

// Endpoint for agents to send messages/tool calls
app.post("/mcp/messages", async (req, res) => {
  if (!transport) {
    return res.status(400).send("No active SSE connection. Connect to /mcp/sse first.");
  }
  await transport.handlePostMessage(req, res);
});

// ==========================================
// 4. START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Maha OS Agentic Gateway running on port ${PORT}`);
  console.log(`SSE Endpoint ready at http://localhost:${PORT}/mcp/sse`);
});
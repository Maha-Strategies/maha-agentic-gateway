import { Request, Response } from 'express';
import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import { Server as SocketIOServer } from 'socket.io';

// Initialize the Gemini SDK using your existing environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const buildChatHandler = (io: SocketIOServer) => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { nodeId, telemetry, history } = req.body;

      if (!nodeId || !telemetry || !history) {
        res.status(400).json({ error: 'Missing required payload parameters (nodeId, telemetry, history)' });
        return;
      }

      // 1. Map Maha OS history format to Gemini's expected format
      const formattedHistory = history.map((msg: { role: string, content: string }) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // 2. Define the exact JSON schema the frontend Steward expects
      const responseSchema: Schema = {
        type: SchemaType.OBJECT,
        properties: {
          reply: { 
            type: SchemaType.STRING, 
            description: "The stoic, conversational response back to the user." 
          },
          severity: { 
            type: SchemaType.STRING, 
            description: "The severity level based on the user's focus. Must be exactly one of: 'none', 'mild', 'moderate', or 'critical'."
          }
        },
        required: ["reply", "severity"]
      };

      // 3. Initialize the model with System Instructions and telemetry context
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: `You are the Steward, an autonomous health agent for Maha OS. 
          Your tone is stoic, precise, supportive, and grounded. You do not feign human emotion.
          Monitor the user's cognitive state and physical baseline. 
          
          Current Live Telemetry for Node ${nodeId}:
          - Readiness: ${telemetry.readiness}/100
          - Resting Heart Rate: ${telemetry.rhr} bpm
          - HRV: ${telemetry.hrv}
          - Glucose: ${telemetry.glucose}
          - Decision Velocity: ${telemetry.decisionVelocity}/10
          
          Evaluate their dialogue against this telemetry. 
          If their biometric state is failing (e.g., RHR > 100, Readiness < 40) or they express severe cognitive fatigue, set severity to 'moderate' or 'critical'. 
          Otherwise, use 'none' or 'mild'. Keep replies concise.`,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.3, // Low temperature for consistent, analytical responses
        }
      });

      // 4. Generate the response
      const result = await model.generateContent({ contents: formattedHistory });
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error("Received empty response from the generative model.");
      }

      const geminiOutput = JSON.parse(responseText);

      // 5. AGENTIC OVERRIDE TRIGGER
      // If the model dictates an intervention, fire it to the exact Socket.io room
      if (geminiOutput.severity === 'critical' || geminiOutput.severity === 'moderate') {
        console.log(`[AGENTIC OVERRIDE] Engaging circuit breaker for Node ${nodeId} (Severity: ${geminiOutput.severity})`);
        io.to(nodeId).emit('trigger_circuit_breaker', { 
          severity: geminiOutput.severity,
          reason: "Steward detected severe biometric/cognitive deviation."
        });
      }

      // Calculate daily allowance (Mocked for now, update with your DB logic)
      const remainingMessages = 50; 

      // 6. Return response to Steward.tsx
      res.status(200).json({
        reply: geminiOutput.reply,
        severity: geminiOutput.severity,
        remaining: remainingMessages
      });

    } catch (error: any) {
      console.error("[STEWARD FAULT] Agentic Core Error:", error.message);
      res.status(500).json({ 
        reply: "My core uplink is currently experiencing interference. Please rely on local nodal protocols until connection is restored.",
        severity: "none"
      });
    }
  };
};
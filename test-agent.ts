async function simulateAgent() {
  const target = "https://mcp.maha-os.com/mcp/sse";
  console.log(`🤖 [AGENT]: Connecting to ${target}...`);

  try {
    // 1. Open the SSE Stream using native fetch
    const response = await fetch(target, {
      headers: { 'Accept': 'text/event-stream' }
    });

    if (!response.ok) throw new Error(`Server rejected: ${response.status}`);

    const reader = response.body?.getReader();
    console.log("✅ SSE Stream Handshake Successful.\n");

    // 2. Read the first chunk (contains the sessionId)
    const { value } = await reader!.read();
    const handshakeData = new TextDecoder().decode(value);
    console.log("📥 Handshake Data:", handshakeData);

    // 3. Extract the sessionId for the Tool Call
    const sessionId = handshakeData.split('sessionId=')[1]?.split('\n')[0];
    
    if (sessionId) {
      console.log(`\n⚡ [AGENT]: Triggering tool via session: ${sessionId}`);
      
      const toolResponse = await fetch(`https://mcp.maha-os.com/mcp/messages?sessionId=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/call",
          params: {
            name: "trigger_circuit_breaker",
            arguments: { severity: "critical" }
          }
        })
      });

      const result = await toolResponse.json();
      console.log("\n🛡️ [MAHA OS RESPONSE]:");
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (err: any) {
    console.error("❌ Test Failed:", err.message);
  }
  process.exit(0);
}

simulateAgent();
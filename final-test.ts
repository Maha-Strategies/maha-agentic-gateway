async function runAgentTest() {
  const target = "https://mcp.maha-os.com/mcp/sse";
  console.log(`🤖 [AGENT]: Connecting to ${target}...`);

  try {
    // 1. Open the stream using native fetch (built into Node v22)
    const response = await fetch(target, {
      headers: { 'Accept': 'text/event-stream' }
    });

    if (!response.ok) {
      console.log(`❌ Server rejected connection: ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    console.log("✅ Connection established.\n");

    // 2. Read the handshake to get the sessionId
    const { value } = await reader!.read();
    const handshake = new TextDecoder().decode(value);
    const sessionId = handshake.split('sessionId=')[1]?.split('\n')[0];

    if (!sessionId) {
      console.log("❌ Could not find sessionId in handshake.");
      return;
    }

    console.log(`📡 Session established: ${sessionId}`);
    console.log("⚡ Triggering Cognitive Circuit Breaker...");

    // 3. Send the Tool Call
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

  } catch (err: any) {
    console.log("🚨 TEST FAILED:", err.message);
  }
  process.exit(0);
}

runAgentTest();
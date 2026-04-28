async function rawDebugConnection() {
  const target = "https://mcp.maha-os.com/mcp/sse";
  console.log(`🔍 [DEBUG]: Testing connection to ${target}...`);

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (MahaOS-Agent-Test)',
        'Accept': 'text/event-stream'
      }
    });

    console.log(`📡 Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log("✅ SUCCESS: The server accepted the connection.");
      console.log("Reading first chunk of stream...");
      
      const reader = response.body?.getReader();
      const { value } = await reader!.read();
      console.log("📥 Received data:", new TextDecoder().decode(value));
    } else {
      console.log("❌ REJECTED: The server refused the terminal request.");
      const text = await response.text();
      console.log(`Response Body: ${text.substring(0, 100)}`);
    }
  } catch (err: any) {
    console.log("🚨 NETWORK ERROR:", err.message);
  }
  process.exit(0);
}

rawDebugConnection();
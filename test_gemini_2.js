const apiKey = process.env.VITE_GEMINI_API_KEY;
const modelsToTry = ["gemini-1.5-pro-latest", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];

async function test() {
  for (const modelName of modelsToTry) {
    console.log(`Testing ${modelName}...`);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }]
          }),
        }
      );
      const data = await response.json();
      console.log(`Response for ${modelName}:`, response.ok ? "Success" : JSON.stringify(data));
    } catch (err) {
      console.error(`Error for ${modelName}:`, err.message);
    }
  }
}
test();

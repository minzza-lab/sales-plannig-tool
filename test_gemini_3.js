const apiKey = process.env.VITE_GEMINI_API_KEY;
const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-2.5-flash"];

async function test() {
  for (const modelName of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] }),
        }
      );
      const data = await response.json();
      console.log(`${modelName}:`, response.ok ? "Success" : data.error.status);
    } catch (err) {
      console.error(`${modelName}:`, err.message);
    }
  }
}
test();

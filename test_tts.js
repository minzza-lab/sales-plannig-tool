import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GOOGLE_TTS_API_KEY;
if (!apiKey) {
  console.error("No API Key found");
  process.exit(1);
}

async function testTTS() {
  console.log("Testing new TTS API Key...");
  try {
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: "테스트 성공!" },
        voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-A" },
        audioConfig: { audioEncoding: "MP3" }
      })
    });
    
    const data = await response.json();
    if (response.ok && data.audioContent) {
      console.log("SUCCESS: Audio string length:", data.audioContent.length);
    } else {
      console.error("FAILED:", data.error?.message || data);
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
testTTS();

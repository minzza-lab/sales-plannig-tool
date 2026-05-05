import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GOOGLE_TTS_API_KEY;

async function testTTS() {
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: "안녕하세요." },
      voice: { languageCode: "ko-KR", name: "ko-KR-Chirp3-HD-Aoede" },
      audioConfig: { audioEncoding: "MP3" }
    })
  });
  const data = await response.json();
  if (data.audioContent) {
    console.log("SUCCESS Chirp3-HD:", data.audioContent.length);
  } else {
    console.error(data);
  }
}
testTTS();

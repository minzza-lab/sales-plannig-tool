import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GOOGLE_TTS_API_KEY;

async function fetchVoices() {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`);
  const data = await res.json();
  const koVoices = data.voices.filter(v => v.languageCodes.includes('ko-KR'));
  console.log("Korean Voices:");
  koVoices.forEach(v => console.log(v.name, v.ssmlGender));
  
  const enVoices = data.voices.filter(v => v.languageCodes.includes('en-US') && v.name.includes('Journey'));
  console.log("\nEnglish Journey Voices:");
  enVoices.forEach(v => console.log(v.name, v.ssmlGender));
}
fetchVoices();

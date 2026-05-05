import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function test() {
  const prompt = `
당신은 웰리힐리파크 리조트의 전문 마케터이자 디자이너입니다.
사용자가 다음 상품에 대한 썸네일(광고 이미지)을 만들려고 합니다: "여름시즌 워터파크 시크릿 특가 티켓"

이 썸네일을 위한 고품질 배경 이미지 프롬프트(반드시 영어로, Stable Diffusion 스타일)와, 시선을 사로잡는 마케팅 카피(메인 카피, 서브 카피) 3가지를 제안해주세요.
배경 이미지 프롬프트는 텍스트를 넣을 수 있도록 'blank space, clean background, abstract or realistic blur' 같은 키워드를 포함하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 출력하지 마세요.
{
  "imagePrompt": "english prompt for background...",
  "copyOptions": [
    { "main": "끌리는 메인 카피 1", "sub": "설명하는 서브 카피 1" },
    { "main": "끌리는 메인 카피 2", "sub": "설명하는 서브 카피 2" },
    { "main": "끌리는 메인 카피 3", "sub": "설명하는 서브 카피 3" }
  ]
}
  `;
  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log("Raw Response:\n", responseText);
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
       console.error("Match failed!");
    } else {
       console.log("Match:\n", jsonMatch[0]);
       JSON.parse(jsonMatch[0]);
       console.log("Parse Success!");
    }
  } catch (err) {
    console.error(err);
  }
}
test();

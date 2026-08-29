/**
 * API Proxy 유틸리티
 * Cloudflare Pages Functions를 통해 Gemini/TTS API를 호출합니다.
 * API 키는 서버 측에서 관리되므로 클라이언트에 노출되지 않습니다.
 */

// Gemini API 요청 타입
interface GeminiPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
  inline_data?: {
    data: string;
    mime_type: string;
  };
}

interface GeminiRequest {
  model?: string;
  contents: Array<{
    parts: GeminiPart[];
  }>;
  generationConfig?: Record<string, unknown>;
}

/**
 * Gemini API를 프록시를 통해 호출합니다.
 * @param parts - 텍스트/이미지/PDF 파트 배열
 * @param model - 사용할 모델 (기본값: gemini-2.0-flash)
 * @param generationConfig - 생성 설정 (optional)
 * @returns 생성된 텍스트
 */
export async function callGemini(
  parts: GeminiPart[],
  model: string = 'gemini-2.0-flash',
  generationConfig?: Record<string, unknown>
): Promise<string> {
  // SDK 스타일의 inlineData(camelCase)를 REST API용 inline_data(snake_case)로 자동 변환
  const mappedParts = parts.map(part => {
    if (part.inlineData) {
      return {
        inline_data: {
          data: part.inlineData.data,
          mime_type: part.inlineData.mimeType
        }
      };
    }
    return part;
  });

  const body: GeminiRequest = {
    model,
    contents: [{ parts: mappedParts as GeminiPart[] }],
  };
  if (generationConfig) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API 에러 (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API에서 응답을 받지 못했습니다.');
  }
  return text;
}

/**
 * Gemini API를 모델 폴백 체인으로 호출합니다.
 * 첫 번째 모델이 실패하면 다음 모델을 시도합니다.
 */
export async function callGeminiWithFallback(
  parts: GeminiPart[],
  models: string[] = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  generationConfig?: Record<string, unknown>
): Promise<string> {
  let lastError: Error | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await callGemini(parts, model, generationConfig);
      } catch (e) {
        lastError = e as Error;
        const retryable = isRetryableGeminiError(lastError);
        const hasRetryLeft = attempt < 2;

        if (!retryable || !hasRetryLeft) break;

        const delay = 700 * 2 ** attempt + Math.round(Math.random() * 300);
        console.warn(`Gemini ${model} 일시 오류, ${delay}ms 후 재시도...`);
        await wait(delay);
      }
    }
    console.warn(`모델 ${model} 실패, 다음 모델 시도...`);
  }

  if (lastError && isRetryableGeminiError(lastError)) {
    throw new Error('AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 제안 받기를 눌러주세요.');
  }
  throw lastError || new Error('모든 모델이 실패했습니다.');
}

function isRetryableGeminiError(error: Error): boolean {
  return /Gemini API 에러 \((408|429|5\d{2})\)/.test(error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * TTS 음성 목록을 가져옵니다.
 */
export async function getTTSVoices(languageCode: string = 'ko-KR') {
  const response = await fetch(`/api/tts-voices?languageCode=${languageCode}`);
  if (!response.ok) {
    throw new Error(`TTS Voices API 에러: ${response.status}`);
  }
  return response.json();
}

/**
 * TTS 음성을 합성합니다.
 * @returns base64 인코딩된 오디오 데이터
 */
export async function synthesizeTTS(
  text: string,
  voiceName: string = 'ko-KR-Wavenet-A',
  speakingRate: number = 1.0,
  pitch: number = 0
): Promise<string> {
  const languageCode = voiceName.substring(0, 5); // e.g., "ko-KR"
  
  const response = await fetch('/api/tts-synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        pitch,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS Synthesize API 에러: ${response.status}`);
  }

  const data = await response.json();
  return data.audioContent;
}

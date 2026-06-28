/**
 * Cloudflare Pages Function: TTS Voices Proxy
 * GET /api/tts-voices
 */

interface Env {
  TTS_API_KEY?: string;
  VITE_GOOGLE_TTS_API_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const apiKey = context.env.TTS_API_KEY || context.env.VITE_GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'TTS API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(context.request.url);
    const langCode = url.searchParams.get('languageCode') || 'ko-KR';

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=${langCode}&key=${apiKey}`
    );

    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

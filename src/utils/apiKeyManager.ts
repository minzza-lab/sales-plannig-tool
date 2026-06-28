const GEMINI_KEY_NAME = 'sp_user_gemini_api_key';
const TTS_KEY_NAME = 'sp_user_tts_api_key';

export const apiKeyManager = {
  /**
   * Gemini API Key를 가져옵니다.
   * 로컬 스토리지에 저장된 키를 먼저 조회하고, 없으면 환경변수(Fallback)를 조회합니다.
   */
  getGeminiKey(): string {
    const savedKey = localStorage.getItem(GEMINI_KEY_NAME);
    if (savedKey && savedKey.trim() !== '') {
      return savedKey.trim();
    }
    // Fallback (로컬 개발용 백업)
    return (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  },

  /**
   * Gemini API Key를 로컬 스토리지에 저장합니다.
   */
  setGeminiKey(key: string): void {
    localStorage.setItem(GEMINI_KEY_NAME, key.trim());
  },

  /**
   * Gemini API Key를 로컬 스토리지에서 삭제합니다.
   */
  removeGeminiKey(): void {
    localStorage.removeItem(GEMINI_KEY_NAME);
  },

  /**
   * Google TTS API Key를 가져옵니다.
   * 로컬 스토리지에 저장된 키를 먼저 조회하고, 없으면 환경변수(Fallback)를 조회합니다.
   */
  getTTSKey(): string {
    const savedKey = localStorage.getItem(TTS_KEY_NAME);
    if (savedKey && savedKey.trim() !== '') {
      return savedKey.trim();
    }
    // Fallback (로컬 개발용 백업)
    return (import.meta.env.VITE_GOOGLE_TTS_API_KEY as string) || '';
  },

  /**
   * Google TTS API Key를 로컬 스토리지에 저장합니다.
   */
  setTTSKey(key: string): void {
    localStorage.setItem(TTS_KEY_NAME, key.trim());
  },

  /**
   * Google TTS API Key를 로컬 스토리지에서 삭제합니다.
   */
  removeTTSKey(): void {
    localStorage.removeItem(TTS_KEY_NAME);
  },

  /**
   * 모든 API 키가 설정되어 있는지 확인합니다.
   */
  hasAllKeys(): boolean {
    return this.getGeminiKey() !== '' && this.getTTSKey() !== '';
  },

  /**
   * Gemini API 키가 설정되어 있는지 확인합니다.
   */
  hasGeminiKey(): boolean {
    return this.getGeminiKey() !== '';
  }
};

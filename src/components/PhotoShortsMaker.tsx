import React, { useState, useRef } from 'react';
import { callGeminiWithFallback, synthesizeTTS } from '../utils/apiProxy';
import './PhotoShortsMaker.css';

const PhotoShortsMaker: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  
  // Generated Assets
  const [script, setScript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  
  // Video Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        resetAssets();
      };
      reader.readAsDataURL(file);
    }
  };

  const resetAssets = () => {
    setScript(null);
    setAudioUrl(null);
    setStickerUrl(null);
    setRecordedVideoUrl(null);
  };

  const generateAssets = async () => {
    if (!selectedImage) {
      alert('먼저 배경으로 쓰일 현장 사진을 업로드해주세요.');
      return;
    }
    if (!topic.trim()) {
      alert('어떤 내용의 숏폼을 만들고 싶은지 입력해주세요. (예: 여름휴가 시즌 워터파크 홍보)');
      return;
    }

    setIsGenerating(true);
    resetAssets();
    setProgressText('AI가 대본 작성 및 스티커 기획 중...');

    try {
      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1];

      // 1. Generate Script and Sticker Prompt simultaneously using JSON schema
      const prompt = `
당신은 최고의 틱톡/릴스 숏폼 감독입니다.
사용자의 주제: "${topic}"

사용자가 제공한 배경 사진을 활용하여 약 10~15초 분량의 매력적인 숏폼 영상 대본을 작성하고, 사진 위에 얹을 단 하나의 AR 스티커 요소(등장인물이나 사물)를 기획하세요.

결과는 반드시 아래의 JSON 형식으로만 반환하세요.
{
  "script": "전문 성우가 읽을 생동감 넘치고 흥미진진한 내레이션 대본 (한국어, 3~4문장)",
  "stickerPrompt": "배경 사진 위에 투명하게 합성할 핵심 객체(인물, 사물 등) 단 1개에 대한 영문 프롬프트 (예: 'A photorealistic beautiful woman in a swimsuit, smiling, full body, isolated on pure solid white background')"
}
`;

      const responseText = await callGeminiWithFallback(
        [{ text: prompt }, { inlineData: { data: base64Data, mimeType: mimeType } }]
      );

      let parsedData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsedData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
      } catch (e) {
        throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
      }

      setScript(parsedData.script);
      console.log('생성된 대본:', parsedData.script);
      console.log('스티커 프롬프트:', parsedData.stickerPrompt);

      setProgressText('AI 성우 더빙 생성 중...');

      // 2. Generate Audio via Google TTS (through proxy)
      const audioBase64 = await synthesizeTTS(parsedData.script, 'ko-KR-Neural2-c', 1.1);
      const audioContent = `data:audio/mp3;base64,${audioBase64}`;
      setAudioUrl(audioContent);

      setProgressText('AI 스티커 에셋 렌더링 중...');

      // 3. Generate Sticker via Pollinations
      const encodedStickerPrompt = encodeURIComponent(parsedData.stickerPrompt);
      const seed = Math.floor(Math.random() * 1000000);
      const stickerImgUrl = `https://image.pollinations.ai/prompt/${encodedStickerPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
      
      const img = new Image();
      img.onload = () => {
        setStickerUrl(stickerImgUrl);
        setIsGenerating(false);
      };
      img.onerror = () => {
        throw new Error('스티커 렌더링 서버 응답 지연');
      };
      img.src = stickerImgUrl;

    } catch (error: any) {
      alert('생성 중 오류가 발생했습니다: ' + error.message);
      setIsGenerating(false);
    }
  };

  const startRendering = async () => {
    if (!canvasRef.current || !audioRef.current || !selectedImage || !stickerUrl) return;

    setIsRecording(true);
    setRecordedVideoUrl(null);
    chunksRef.current = [];

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load images
    const bgImg = new Image();
    const stImg = new Image();
    
    await Promise.all([
      new Promise(resolve => { bgImg.onload = resolve; bgImg.src = selectedImage; }),
      new Promise(resolve => { stImg.onload = resolve; stImg.crossOrigin = "Anonymous"; stImg.src = stickerUrl; })
    ]);

    // Setup MediaRecorder
    // Capture canvas stream at 30 FPS
    const canvasStream = canvas.captureStream(30);
    
    // Play audio and capture its stream
    audioRef.current.currentTime = 0;
    
    // Create audio destination node to capture audio
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audioRef.current);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination); // Also play out loud
    
    const audioStream = dest.stream;

    // Combine streams
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);

    mediaRecorderRef.current = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);
      setRecordedVideoUrl(videoUrl);
      setIsRecording(false);
    };

    mediaRecorderRef.current.start();
    audioRef.current.play();

    // Animation Loop
    let startTime = Date.now();
    const duration = audioRef.current.duration * 1000; // in ms

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Background Animation: Ken Burns (Zoom in slowly)
      const bgScale = 1 + (progress * 0.2); // Zoom in from 1x to 1.2x
      const drawWidth = canvas.width * bgScale;
      const drawHeight = canvas.height * bgScale;
      const offsetX = -(drawWidth - canvas.width) / 2;
      const offsetY = -(drawHeight - canvas.height) / 2;
      
      ctx.save();
      ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();

      // Sticker Animation: Pan left to right slightly, or bounce
      const stScale = 0.5; // Sticker size
      const stWidth = canvas.width * stScale;
      const stHeight = canvas.width * stScale;
      
      // Calculate X based on progress to create movement
      const startX = canvas.width * 0.1;
      const endX = canvas.width * 0.4;
      const currentX = startX + (endX - startX) * progress;
      const currentY = canvas.height - stHeight - 50;

      // Apply Multiply blend mode to remove white background of sticker
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(stImg, currentX, currentY, stWidth, stHeight);
      ctx.restore();

      // Draw Subtitles
      if (script) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, canvas.height - 100, canvas.width, 80);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Very basic subtitle splitting logic
        const words = script.split(' ');
        const wordsPerSegment = Math.ceil(words.length / 5);
        const currentSegmentIdx = Math.floor(progress * 5);
        const currentWords = words.slice(currentSegmentIdx * wordsPerSegment, (currentSegmentIdx + 1) * wordsPerSegment).join(' ');

        ctx.fillText(currentWords, canvas.width / 2, canvas.height - 60);
        ctx.restore();
      }

      if (progress < 1 && !audioRef.current?.paused) {
        requestAnimationFrame(animate);
      } else {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }
    };

    animate();
  };

  return (
    <div className="shorts-maker-container animate-fade-in">
      <div className="shorts-header">
        <div className="header-titles">
          <h1>🎬 AI 숏폼 영상 메이커</h1>
          <p>사진과 주제만 넣으면 AI가 대본, 음성, 움직이는 AR 스티커를 자동 생성하여 한 편의 영상을 만들어 냅니다.</p>
        </div>
      </div>

      <div className="shorts-workspace">
        <div className="shorts-left-panel">
          <div className="panel-section">
            <h2 className="section-title">1. 배경 현장 사진 업로드</h2>
            <div 
              className="upload-box mini" 
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedImage ? (
                <img src={selectedImage} alt="Background" className="preview-image" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📸</span>
                  <p>현장 사진 업로드</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
          </div>

          <div className="panel-section">
            <h2 className="section-title">2. 숏폼 주제 및 기획 의도</h2>
            <textarea
              className="topic-textarea"
              placeholder="예: 우리 워터파크 새로 오픈한 파도풀장 홍보. 튜브를 탄 예쁜 모델이 화면에 같이 나오면 좋겠어."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button 
              className="generate-btn mt-3" 
              onClick={generateAssets}
              disabled={isGenerating || !selectedImage || !topic.trim()}
            >
              {isGenerating ? 'AI가 기획 및 에셋 생성 중...' : '✨ 숏폼 리소스 자동 생성하기'}
            </button>
          </div>

          {script && (
            <div className="panel-section animate-fade-in script-review">
              <h2 className="section-title">📝 AI가 작성한 대본</h2>
              <div className="script-box">
                {script}
              </div>
              <p className="hint">대본, 성우 음성, AR 스티커가 모두 준비되었습니다! 우측 렌더링 화면에서 비디오를 생성해보세요.</p>
            </div>
          )}
        </div>

        <div className="shorts-right-panel">
          <div className="panel-section result-section">
            <h2 className="section-title">🎥 비디오 렌더링 화면</h2>
            
            <div className="video-preview-area">
              {isGenerating ? (
                <div className="loading-overlay">
                  <div className="loader"></div>
                  <p className="loading-text">{progressText}</p>
                </div>
              ) : (stickerUrl && audioUrl) ? (
                <div className="rendering-container">
                  <canvas 
                    ref={canvasRef} 
                    width={540} 
                    height={960} 
                    className="render-canvas"
                  />
                  {audioUrl && <audio ref={audioRef} src={audioUrl} style={{ display: 'none' }} onEnded={() => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                      mediaRecorderRef.current.stop();
                    }
                  }} />}
                  
                  {!recordedVideoUrl ? (
                    <div className="render-controls">
                      <button 
                        className={`action-btn start-btn ${isRecording ? 'recording' : ''}`}
                        onClick={startRendering}
                        disabled={isRecording}
                      >
                        {isRecording ? '🔴 영상 렌더링/녹화 중...' : '▶️ 숏폼 비디오 렌더링 시작'}
                      </button>
                    </div>
                  ) : (
                    <div className="render-controls success">
                      <video src={recordedVideoUrl} controls className="final-video" />
                      <a href={recordedVideoUrl} download="ai_shorts_video.webm" className="action-btn download-btn">
                        💾 완성된 비디오 다운로드
                      </a>
                      <button className="action-btn reset-btn" onClick={() => setRecordedVideoUrl(null)}>
                        다시 렌더링하기
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-result-placeholder">
                  <span className="empty-icon">🎬</span>
                  <p>왼쪽에서 리소스를 생성하면<br />이곳에서 비디오 렌더링 및 다운로드가 가능합니다.</p>
                </div>
              )}
            </div>
            
            <div className="info-box-shorts">
              <h4>💡 숏폼 메이커 활용 팁</h4>
              <p>• 렌더링 시작을 누르면 AI 스티커와 배경이 자동으로 움직이며 음성에 맞춰 영상이 녹화됩니다.</p>
              <p>• 완성된 영상은 <b>webm 포맷</b>으로 저장되며, 인스타그램이나 유튜브에 바로 업로드할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoShortsMaker;

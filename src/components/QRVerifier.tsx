import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Html5Qrcode } from 'html5-qrcode';
import * as XLSX from 'xlsx';
import { 
  QrCode, 
  Database, 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Info, 
  RefreshCw,
  Search,
  Plus,
  Volume2,
  Clock,
  Download,
  Play
} from 'lucide-react';
import './QRVerifier.css';

interface QRMapping {
  id?: string;
  prefix: string;
  unique_value: string;
  description: string | null;
  category: string | null;
  ticket_type: string | null;
  discount_info: string | null; // 식음 K열 전용
  created_at?: string;
}

interface GroupedQRMapping {
  prefix: string;
  unique_value: string;
  category: string;
  ticket_type: string;
  descriptions: string[];
  discount_infos: string[]; // 식음 전용 요금 할인 데이터 모음
}

interface HistoryItem {
  scannedText: string;
  prefix: string;
  uniqueValue: string;
  timestamp: string;
  items: QRMapping[];
}

export default function QRVerifier() {
  const [activeTab, setActiveTab] = useState<'scan' | 'data'>('scan');
  
  // Scanning States
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    prefix: string;
    scannedText: string;
    uniqueValue?: string;
    items?: QRMapping[]; // 매칭되는 전체 데이터 행 리스트
    message?: string;
  } | null>(null);
  
  // Data Manager States
  const [mappingData, setMappingData] = useState<QRMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0); // 실제 DB 전체 건수
  
  // Filter States
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterTicketType, setFilterTicketType] = useState('all');
  
  // Manual Lookup (Text Search) State
  const [manualSearchText, setManualSearchText] = useState('');
  
  // Manual Input States
  const [manualPrefix, setManualPrefix] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualCategory, setManualCategory] = useState('식음');
  const [manualTicketType, setManualTicketType] = useState('일반');
  const [manualDiscount, setManualDiscount] = useState(''); // 수동 할인 정보
  
  // Premium Features States
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [autoResume, setAutoResume] = useState(true);
  const [countdown, setCountdown] = useState(5);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrCodeInstanceRef = useRef<Html5Qrcode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('qr_verifier_history');
    if (saved) {
      try {
        setHistoryList(JSON.parse(saved));
      } catch (e) {
        console.error('기록 파싱 에러:', e);
      }
    }
  }, []);

  // Fetch mappings on load & when tab switches to data
  useEffect(() => {
    if (activeTab === 'data') {
      fetchMappings();
    }
  }, [activeTab]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
      clearCountdown();
    };
  }, []);

  // Handle Scanner toggle
  useEffect(() => {
    if (activeTab === 'scan' && isScanning) {
      startScanner();
    } else {
      stopScanner();
    }
  }, [isScanning, activeTab]);

  // Auto-resume Timer Effect
  useEffect(() => {
    clearCountdown();
    
    if (scanResult && scanResult.success && autoResume) {
      setCountdown(5); // 5초 카운트다운 시작
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearCountdown();
            closeResultAndResume();
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearCountdown();
  }, [scanResult, autoResume]);

  const clearCountdown = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Beep Audio Feedback Helper
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // 1.2KHz 선명한 신호음
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); // 부드러운 음량
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08); // 80ms 재생
    } catch (e) {
      console.warn('AudioContext 재생 오류:', e);
    }
  };

  const startScanner = async () => {
    try {
      if (qrCodeInstanceRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode('reader');
      qrCodeInstanceRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15, // 프레임 레이트 상향
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.75; // 상자 비율 확장
            return { width: size, height: size };
          },
          aspectRatio: 1.0 // 1:1 카메라 고정
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (_errorMessage) => {
          // Silent failure
        }
      );
    } catch (err) {
      console.error('카메라 시작 오류:', err);
      alert('카메라를 활성화하는 도중 오류가 발생했습니다. 카메라 권한을 확인해주세요.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (qrCodeInstanceRef.current && qrCodeInstanceRef.current.isScanning) {
      try {
        await qrCodeInstanceRef.current.stop();
      } catch (err) {
        console.error('카메라 중지 오류:', err);
      } finally {
        qrCodeInstanceRef.current = null;
      }
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    // 햅틱 진동 피드백
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }
    
    // 선명한 비프 사운드 재생
    playBeep();

    setIsScanning(false);
    await stopScanner();

    const trimmedText = decodedText.trim();
    const prefix = trimmedText.substring(0, 5).toLowerCase();

    if (prefix.length < 5) {
      setScanResult({
        success: false,
        scannedText: trimmedText,
        prefix,
        message: '텍스트가 너무 짧습니다. (최소 5글자 필요)'
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('qr_mapping_data')
        .select('*')
        .eq('prefix', prefix);

      if (error) throw error;

      if (data && data.length > 0) {
        const matchTitle = data[0].unique_value;
        const newResult = {
          success: true,
          scannedText: trimmedText,
          prefix: data[0].prefix,
          uniqueValue: matchTitle,
          items: data
        };

        setScanResult(newResult);

        // 히스토리 목록 추가
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const historyItem: HistoryItem = {
          scannedText: trimmedText,
          prefix: data[0].prefix,
          uniqueValue: matchTitle,
          timestamp,
          items: data
        };

        setHistoryList(prev => {
          // 중복 스캔 시 기존 항목 제거 후 맨 위 배치
          const filtered = prev.filter(h => h.prefix !== data[0].prefix);
          const updated = [historyItem, ...filtered].slice(0, 10); // 최대 10건 보관
          localStorage.setItem('qr_verifier_history', JSON.stringify(updated));
          return updated;
        });

      } else {
        setScanResult({
          success: false,
          scannedText: trimmedText,
          prefix,
          message: '일치하는 접두어(Prefix) 정보를 찾을 수 없습니다.'
        });
      }
    } catch (err) {
      console.error('DB 조회 에러:', err);
      setScanResult({
        success: false,
        scannedText: trimmedText,
        prefix,
        message: '데이터베이스 조회 중 오류가 발생했습니다.'
      });
    } finally {
      setIsLoading(false);
      setManualSearchText('');
    }
  };

  const closeResultAndResume = () => {
    clearCountdown();
    setScanResult(null);
    setIsScanning(true);
  };

  // History action helpers
  const handleOpenHistoryItem = (item: HistoryItem) => {
    clearCountdown();
    setScanResult({
      success: true,
      scannedText: item.scannedText,
      prefix: item.prefix,
      uniqueValue: item.uniqueValue,
      items: item.items
    });
  };

  const handleClearHistory = () => {
    if (window.confirm('최근 스캔 기록을 모두 지우시겠습니까?')) {
      setHistoryList([]);
      localStorage.removeItem('qr_verifier_history');
    }
  };

  // Data Actions
  const fetchMappings = async () => {
    try {
      setIsLoading(true);
      const { data, error, count } = await supabase
        .from('qr_mapping_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, 99999);

      if (error) throw error;
      setMappingData(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('데이터 조회 오류:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('파일 읽는 중...');
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        const targetSheets = ['식음', '발권', 'RC', '워터'];
        const parsedData: QRMapping[] = [];
        let totalRowsAnalyzed = 0;
        const sheetSummaries: string[] = [];

        const fileSheetNames = wb.SheetNames;

        targetSheets.forEach(targetName => {
          const matchedRealSheetName = fileSheetNames.find(name => {
            const cleanName = name.replace(/\s+/g, '').toLowerCase();
            const cleanTarget = targetName.toLowerCase();
            return cleanName.includes(cleanTarget);
          });

          if (!matchedRealSheetName) {
            sheetSummaries.push(`${targetName} 시트 없음`);
            return;
          }

          const ws = wb.Sheets[matchedRealSheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          
          if (rawRows.length <= 1) {
            sheetSummaries.push(`${targetName}: 데이터 없음`);
            return;
          }

          let sheetRowCount = 0;
          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length <= 3) continue;

            const dVal = String(row[3] || '').trim();
            const eVal = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : '공통';
            const jVal = row[9] !== undefined && row[9] !== null ? String(row[9]).trim() : '일반';
            
            const discountVal = targetName === '식음' && row[10] !== undefined && row[10] !== null 
              ? String(row[10]).trim() 
              : null;

            if (dVal.length < 5) continue;

            const rawPrefix = dVal.substring(0, 5);
            const cleanPrefix = rawPrefix.toLowerCase();

            parsedData.push({
              prefix: cleanPrefix,
              unique_value: dVal,
              description: eVal,
              category: targetName,
              ticket_type: jVal,
              discount_info: discountVal
            });
            sheetRowCount++;
          }

          totalRowsAnalyzed += sheetRowCount;
          sheetSummaries.push(`${targetName}: ${sheetRowCount}건 수집`);
        });

        if (parsedData.length === 0) {
          setUploadStatus(`업로드 오류: 유효한 데이터가 없습니다. [파일 내 실제 시트 목록: ${fileSheetNames.join(', ')}]`);
          return;
        }

        const uniqueMap = new Map<string, QRMapping>();
        parsedData.forEach(item => {
          const key = `${item.prefix}:::${item.description || ''}:::${item.category || ''}:::${item.ticket_type || ''}`;
          const existing = uniqueMap.get(key);
          if (!existing || (!existing.discount_info && item.discount_info)) {
            uniqueMap.set(key, item);
          }
        });
        const finalData = Array.from(uniqueMap.values());

        setUploadStatus(`저장 중... [상세내역: ${sheetSummaries.join(' | ')}]`);

        const { error } = await supabase
          .from('qr_mapping_data')
          .upsert(finalData, { onConflict: 'prefix,description,category,ticket_type' });

        if (error) throw error;

        setUploadStatus(`성공적으로 업로드 완료! 총 ${finalData.length}개 저장됨 (${sheetSummaries.join(' / ')})`);
        fetchMappings();
      } catch (err: any) {
        console.error('업로드 실패:', err);
        setUploadStatus(`업로드 오류: ${err.message || '알 수 없는 에러'}`);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Export Mappings List to Excel (.xlsx)
  const handleExportToExcel = () => {
    if (mappingData.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    
    try {
      // 내보내기용 데이터를 깔끔하게 배열 형태로 생성
      const exportRows = filteredData.map(item => ({
        '대분류 (시트)': item.category,
        '접두어 (5글자)': item.prefix.toUpperCase(),
        '매칭 상품명 (D열)': item.unique_value,
        '권종 구분 (J열)': item.ticket_type,
        '대체 사용 가능 업장 (E열)': item.descriptions.join(', '),
        '요금 할인 (식음 K열)': item.discount_infos.join(', ') || '-'
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '대체업장 매핑목록');
      
      // 파일 크기 최적화 및 다운로드 트리거
      XLSX.writeFile(workbook, `대체업장_매핑목록_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) {
      console.error('엑셀 추출 에러:', e);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanPrefix = manualPrefix.trim().substring(0, 5).toLowerCase();
    const cleanValue = manualValue.trim();
    const cleanDesc = manualDesc.trim();

    if (cleanPrefix.length < 5) {
      alert('접두어는 반드시 5글자여야 합니다.');
      return;
    }

    if (!cleanValue) {
      alert('매칭 상품명을 입력해주세요.');
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('qr_mapping_data')
        .upsert({
          prefix: cleanPrefix,
          unique_value: cleanValue,
          description: cleanDesc || '공통',
          category: manualCategory || '공통',
          ticket_type: manualTicketType || '일반',
          discount_info: manualCategory === '식음' && manualDiscount.trim() ? manualDiscount.trim() : null
        }, { onConflict: 'prefix,description,category,ticket_type' });

      if (error) throw error;

      alert(`접두어 [${cleanPrefix.toUpperCase()}] 데이터가 성공적으로 등록/수정되었습니다.`);
      
      setManualPrefix('');
      setManualValue('');
      setManualDesc('');
      setManualCategory('식음');
      setManualTicketType('일반');
      setManualDiscount('');
      
      fetchMappings();
    } catch (err: any) {
      console.error('수동 등록 오류:', err);
      alert(`등록 실패: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('정말로 모든 매핑 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('qr_mapping_data')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      alert('모든 데이터가 정상적으로 삭제되었습니다.');
      fetchMappings();
    } catch (err) {
      console.error('데이터 삭제 실패:', err);
      alert('데이터 삭제 도중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // prefix 기준 1:N 업장코드 그룹화 헬퍼 함수
  const groupDataByPrefix = (rawList: QRMapping[]): GroupedQRMapping[] => {
    const map = new Map<string, GroupedQRMapping>();

    rawList.forEach(item => {
      const cleanPrefix = item.prefix;
      const existing = map.get(cleanPrefix);

      if (existing) {
        if (item.description && !existing.descriptions.includes(item.description)) {
          existing.descriptions.push(item.description);
        }
        if (item.discount_info && !existing.discount_infos.includes(item.discount_info)) {
          existing.discount_infos.push(item.discount_info);
        }
      } else {
        map.set(cleanPrefix, {
          prefix: cleanPrefix,
          unique_value: item.unique_value,
          category: item.category || '공통',
          ticket_type: item.ticket_type || '일반',
          descriptions: item.description ? [item.description] : [],
          discount_infos: item.discount_info ? [item.discount_info] : []
        });
      }
    });

    return Array.from(map.values());
  };

  const uniqueTicketTypes = Array.from(
    new Set(mappingData.map(item => item.ticket_type).filter(Boolean))
  ) as string[];

  const groupedData = groupDataByPrefix(mappingData);

  const filteredData = groupedData.filter(item => {
    const matchesSearch = 
      item.prefix.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.unique_value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.descriptions.some(desc => desc.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchesTicketType = filterTicketType === 'all' || item.ticket_type === filterTicketType;

    return matchesSearch && matchesCategory && matchesTicketType;
  });

  return (
    <div className="qr-verifier-container">
      <div className="qr-verifier-header">
        <h2>대체업장 조회 도구</h2>
        <p>카메라로 QR 코드를 스캔하거나 코드를 직접 입력해 매칭되는 대체 사용 가능 업장과 혜택을 조회합니다.</p>
      </div>

      <div className="qr-tabs">
        <button 
          className={`qr-tab-btn ${activeTab === 'scan' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('scan');
            setScanResult(null);
          }}
        >
          <QrCode size={18} />
          실시간 대체업장 조회
        </button>
        <button 
          className={`qr-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('data');
            stopScanner();
            setIsScanning(false);
          }}
        >
          <Database size={18} />
          매핑 데이터 관리
        </button>
      </div>

      {/* TAB 1: SCANNER */}
      {activeTab === 'scan' && (
        <div className="scanner-section" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '1.2rem' }}>
            
            {/* Camera Scanner Container */}
            <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '0.8rem', fontWeight: 600, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📷 카메라 실시간 스캔
              </h3>
              
              {!isScanning ? (
                <div className="text-center" style={{ 
                  padding: '2rem 0', 
                  width: '100%', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '20px'
                }}>
                  <QrCode size={44} style={{ color: '#3b82f6', marginBottom: '1rem', opacity: 0.8 }} />
                  <div style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                    카메라를 활성화하여 QR 코드를 가져오세요.
                  </div>
                  <button 
                    className="scan-btn scan-btn-primary"
                    onClick={() => setIsScanning(true)}
                    style={{ margin: '0 auto', padding: '0.7rem 1.3rem', fontSize: '0.9rem' }}
                  >
                    카메라 스캔 시작
                  </button>
                </div>
              ) : (
                <>
                  <div className="scanner-wrapper">
                    <div id="reader" style={{ width: '100%' }}></div>
                    <div className="scanner-overlay">
                      <div className="scan-box-guide"></div>
                    </div>
                  </div>
                  
                  <div className="scan-controls" style={{ marginTop: '0.8rem' }}>
                    <button 
                      className="scan-btn scan-btn-secondary"
                      onClick={() => setIsScanning(false)}
                      style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}
                    >
                      카메라 정지
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Middle divider */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '100%', 
              maxWidth: '480px',
              color: '#4b5563', 
              fontSize: '0.85rem',
              fontWeight: 600,
              margin: '0.2rem 0'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
              <span style={{ padding: '0 1rem' }}>또는</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
            </div>

            {/* Manual Code Input Lookup */}
            <div style={{ 
              width: '100%', 
              maxWidth: '480px', 
              background: 'rgba(255, 255, 255, 0.02)', 
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '20px',
              padding: '1.2rem',
              textAlign: 'center'
            }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                ✍️ 코드 직접 입력 조회
              </h3>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
                앞 5자리 이상 상품코드를 입력하여 바로 조회합니다.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text"
                  placeholder="조회할 코드 입력 (예: 9460B...)"
                  value={manualSearchText}
                  onChange={(e) => setManualSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualSearchText.trim()) {
                      handleScanSuccess(manualSearchText);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: '#ffffff',
                    color: '#000000',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                />
                <button 
                  onClick={() => {
                    if (!manualSearchText.trim()) return;
                    handleScanSuccess(manualSearchText);
                  }}
                  style={{
                    padding: '0 1rem',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'background 0.2s'
                  }}
                >
                  조회
                </button>
              </div>
            </div>

            {/* Premium Feature: Recent History List */}
            {historyList.length > 0 && (
              <div style={{ 
                width: '100%', 
                maxWidth: '480px', 
                background: 'rgba(255, 255, 255, 0.01)', 
                border: '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: '16px',
                padding: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={14} /> 최근 조회 기록 ({historyList.length}건)
                  </span>
                  <button 
                    onClick={handleClearHistory} 
                    style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    기록 전체삭제
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {historyList.map((item, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => handleOpenHistoryItem(item)}
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)', 
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.5rem 0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', textAlign: 'left', flex: 1, marginRight: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#60a5fa' }}>{item.prefix.toUpperCase()}</span>
                        <span style={{ color: '#9ca3af', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '280px' }}>
                          {item.uniqueValue}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#4b5563' }}>{item.timestamp}</span>
                        <Play size={10} style={{ color: '#10b981' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Result Dialog Modal */}
          {scanResult && (
            <div className="result-overlay">
              <div className={`result-card ${scanResult.success ? 'result-success' : 'result-fail'}`}>
                <div className="result-icon">
                  {scanResult.success ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
                </div>

                <h3>{scanResult.success ? '조회 완료' : '조회 실패'}</h3>

                <div className="result-detail-box">
                  <div className="result-row">
                    <span className="result-label">스캔 원본:</span>
                    <span className="result-val">{scanResult.scannedText}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">파싱 접두어:</span>
                    <span className="result-val highlight" style={{ textTransform: 'uppercase' }}>{scanResult.prefix}</span>
                  </div>
                  
                  {scanResult.success ? (
                    <>
                      <div className="result-row" style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.6rem' }}>
                        <span className="result-label" style={{ fontSize: '0.85rem' }}>매칭 상품명:</span>
                        <div className="result-val highlight" style={{ color: '#10b981', fontSize: '1.1rem', marginTop: '0.2rem', display: 'block', wordBreak: 'break-all', fontWeight: 700 }}>
                          {scanResult.uniqueValue}
                        </div>
                      </div>
                      
                      <div className="result-row" style={{ display: 'block', textAlign: 'left' }}>
                        <span className="result-label" style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.9rem' }}>
                          📍 상세 사용처 및 권종구분 ({scanResult.items?.length || 0}건)
                        </span>
                        
                        <div style={{ 
                          maxHeight: '200px', 
                          overflowY: 'auto',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '10px',
                          background: 'rgba(0, 0, 0, 0.25)'
                        }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <th style={{ padding: '0.5rem 0.7rem', color: '#f59e0b', fontWeight: 600 }}>대분류</th>
                                <th style={{ padding: '0.5rem 0.7rem', color: '#60a5fa', fontWeight: 600 }}>업장 코드 (E열)</th>
                                <th style={{ padding: '0.5rem 0.7rem', color: '#10b981', fontWeight: 600 }}>권종 구분 (J열)</th>
                                {scanResult.items?.some(item => item.discount_info) && (
                                  <th style={{ padding: '0.5rem 0.7rem', color: '#ec4899', fontWeight: 600 }}>요금 할인 (식음 K열)</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {scanResult.items?.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                  <td style={{ padding: '0.5rem 0.7rem', color: '#f3f4f6' }}>{item.category}</td>
                                  <td style={{ padding: '0.5rem 0.7rem', color: '#9ca3af' }}>{item.description || '-'}</td>
                                  <td style={{ padding: '0.5rem 0.7rem', color: '#10b981', fontWeight: 600 }}>{item.ticket_type}</td>
                                  {scanResult.items?.some(i => i.discount_info) && (
                                    <td style={{ padding: '0.5rem 0.7rem', color: '#ec4899', fontWeight: 600 }}>
                                      {item.category === '식음' ? (item.discount_info || '-') : '-'}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="result-row" style={{ color: '#f87171', marginTop: '0.5rem', fontWeight: 600 }}>
                      <Info size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      {scanResult.message}
                    </div>
                  )}
                </div>

                {/* Auto-resume details UI */}
                {scanResult.success && autoResume && (
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                    <Volume2 size={12} style={{ color: '#10b981' }} />
                    <span><b>{countdown}</b>초 후 카메라 스캔이 자동으로 재개됩니다.</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#9ca3af', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={autoResume} 
                      onChange={(e) => {
                        setAutoResume(e.target.checked);
                        if (!e.target.checked) clearCountdown();
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    자동 스캔 재개 활성화
                  </label>
                </div>

                <button className="result-close-btn" onClick={closeResultAndResume}>
                  확인 후 스캔 재개
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DATA MANAGER */}
      {activeTab === 'data' && (
        <div className="manager-section">
          {/* Layout grid for upload & manual inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* File Upload Dropzone */}
            <div className="upload-card" onClick={triggerFileSelect} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                className="file-input"
              />
              <div className="upload-card-content">
                <UploadCloud size={40} className="upload-icon" />
                <span className="upload-title">엑셀 파일 일괄 업로드</span>
                <span className="upload-desc">
                  클릭하여 파일(.xlsx, .csv) 선택<br/>
                  (시트: 식음, 발권, RC, 워터 분석 지원)
                </span>
              </div>
            </div>

            {/* Manual Add Form */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa' }}>
                <Plus size={18} />
                매핑 데이터 수동 추가/수정
              </h3>
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>대분류</label>
                    <select
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: '#ffffff',
                        color: '#000000',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="식음">식음</option>
                      <option value="발권">발권</option>
                      <option value="RC">RC</option>
                      <option value="워터">워터</option>
                      <option value="공통">공통</option>
                    </select>
                  </div>
                  <div style={{ flex: 1.5 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>권종 구분</label>
                    <input 
                      type="text" 
                      placeholder="예: 대인/소인"
                      value={manualTicketType}
                      onChange={(e) => setManualTicketType(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: '#ffffff',
                        color: '#000000',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>접두어 (5글자)</label>
                    <input 
                      type="text" 
                      maxLength={5}
                      placeholder="예: 9460B"
                      value={manualPrefix}
                      onChange={(e) => setManualPrefix(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: '#ffffff',
                        color: '#000000',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>매칭 상품명</label>
                    <input 
                      type="text" 
                      placeholder="예: 상품명 전체"
                      value={manualValue}
                      onChange={(e) => setManualValue(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: '#ffffff',
                        color: '#000000',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <div style={{ flex: 1.2 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>업장 코드</label>
                    <input 
                      type="text" 
                      placeholder="예: FB08 - 눈썰매"
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: '#ffffff',
                        color: '#000000',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  
                  {manualCategory === '식음' && (
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.2rem' }}>요금 할인 (식음 K열)</label>
                      <input 
                        type="text" 
                        placeholder="예: 20% 할인"
                        value={manualDiscount}
                        onChange={(e) => setManualDiscount(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          background: '#ffffff',
                          color: '#000000',
                          outline: 'none',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  )}
                </div>
                <button 
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    marginTop: '0.2rem'
                  }}
                >
                  <Plus size={16} />
                  데이터 저장하기
                </button>
              </form>
            </div>
          </div>

          {/* Upload Status Alert */}
          {uploadStatus && (
            <div style={{
              background: uploadStatus.includes('성공') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
              border: `1px solid ${uploadStatus.includes('성공') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
              color: uploadStatus.includes('성공') ? '#10b981' : '#60a5fa',
              padding: '1rem',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: 500
            }}>
              {uploadStatus}
            </div>
          )}

          {/* Controls and Counters */}
          <div className="data-stats-row">
            <div className="data-count" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>등록: <b>{totalCount}</b> 건</span> | <span>압축: <b>{groupedData.length}</b> 건</span>
            </div>
            
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button 
                className="qr-tab-btn" 
                onClick={fetchMappings} 
                style={{ padding: '0.45rem 0.8rem', margin: 0, fontSize: '0.85rem' }}
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                새로고침
              </button>

              <button 
                className="qr-tab-btn" 
                onClick={handleExportToExcel} 
                style={{ padding: '0.45rem 0.8rem', margin: 0, fontSize: '0.85rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981' }}
                disabled={isLoading}
              >
                <Download size={14} />
                엑셀 내보내기
              </button>
              
              {mappingData.length > 0 && (
                <button className="clear-btn" onClick={handleClearAll} style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }} disabled={isLoading}>
                  <Trash2 size={14} />
                  전체 삭제
                </button>
              )}
            </div>
          </div>

          {/* Search Box & Filters */}
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            {/* 검색바 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 2, minWidth: '220px' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', color: '#9ca3af' }} />
              <input 
                type="text"
                placeholder="접두어, 상품명, 업장명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem 0.8rem 2.8rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>

            {/* 대분류 필터 */}
            <div style={{ flex: 1, minWidth: '120px' }}>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all" style={{ background: '#1e293b' }}>전체 대분류</option>
                <option value="식음" style={{ background: '#1e293b' }}>식음</option>
                <option value="발권" style={{ background: '#1e293b' }}>발권</option>
                <option value="RC" style={{ background: '#1e293b' }}>RC</option>
                <option value="워터" style={{ background: '#1e293b' }}>워터</option>
                <option value="공통" style={{ background: '#1e293b' }}>공통</option>
              </select>
            </div>

            {/* 권종 필터 */}
            <div style={{ flex: 1, minWidth: '120px' }}>
              <select
                value={filterTicketType}
                onChange={(e) => setFilterTicketType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all" style={{ background: '#1e293b' }}>전체 권종구분</option>
                {uniqueTicketTypes.map((type, idx) => (
                  <option key={idx} value={type} style={{ background: '#1e293b' }}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Data List Table */}
          <div className="data-list-card">
            <div className="data-list-header">
              현재 등록된 매핑 목록
            </div>
            <div className="data-table-wrapper">
              {isLoading && mappingData.length === 0 ? (
                <div className="loading-indicator">
                  <div className="spinner"></div>
                  <span>데이터를 가져오는 중...</span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="empty-state">
                  등록되었거나 검색 조건에 일치하는 매핑 데이터가 없습니다.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>대분류</th>
                      <th>접두어</th>
                      <th>매칭 상품명 (D열)</th>
                      <th>권종 구분 (J열)</th>
                      <th>업장 코드 (E열)</th>
                      <th>요금 할인 (식음 K열)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: '#f59e0b' }}>{item.category}</td>
                        <td style={{ fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase' }}>{item.prefix}</td>
                        <td>{item.unique_value}</td>
                        <td style={{ fontWeight: 600, color: '#10b981' }}>{item.ticket_type}</td>
                        <td style={{ color: '#60a5fa', fontWeight: 600 }}>
                          {item.descriptions.length > 0 ? item.descriptions.join(', ') : '-'}
                        </td>
                        <td style={{ color: '#ec4899', fontWeight: 600 }}>
                          {item.category === '식음' && item.discount_infos.length > 0 
                            ? item.discount_infos.join(', ') 
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

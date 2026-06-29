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
  Plus
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrCodeInstanceRef = useRef<Html5Qrcode | null>(null);

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

  const startScanner = async () => {
    try {
      // Ensure any existing scanner is stopped
      if (qrCodeInstanceRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode('reader');
      qrCodeInstanceRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15, // 프레임 레이트를 15 FPS로 상향하여 모바일 기기에서의 스캔 감도 극대화
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.75; // QR 인식 상자 영역 비율을 75%로 확장
            return { width: size, height: size };
          },
          aspectRatio: 1.0 // 1:1 카메라 스캔 비율 고정으로 화면 뒤틀림 방지
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
    // 모바일 기기 스캔 성공 시 햅틱 피드백(진동 80ms) 제공
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }

    // 1. Stop scanner immediately to prevent duplicate scans
    setIsScanning(false);
    await stopScanner();

    // 2. Parse prefix (first 5 characters) and convert to lowercase for matching
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
      // 3. Query Supabase using lowercase prefix (multiple records can match)
      const { data, error } = await supabase
        .from('qr_mapping_data')
        .select('*')
        .eq('prefix', prefix);

      if (error) throw error;

      if (data && data.length > 0) {
        setScanResult({
          success: true,
          scannedText: trimmedText,
          prefix: data[0].prefix,
          uniqueValue: data[0].unique_value,
          items: data // 매칭된 모든 1:N 레코드 저장
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
      setManualSearchText(''); // 검색창 초기화
    }
  };

  const closeResultAndResume = () => {
    setScanResult(null);
    setIsScanning(true);
  };

  // Data Actions
  const fetchMappings = async () => {
    try {
      setIsLoading(true);
      // count: 'exact' 및 range(0, 99999)로 조회수 한도 대폭 증가 (10만건)
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

        // 파일 내에 존재하는 실제 시트 이름 목록
        const fileSheetNames = wb.SheetNames;

        targetSheets.forEach(targetName => {
          // 시트명에 타겟 키워드('식음', '발권', 'RC', '워터')가 포함되는지 검사 (예: '1.식음' -> '식음' 매칭 가능)
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

          // D열 (Index 3), E열 (Index 4), J열 (Index 9)에서 직접 추출 (헤더 스캔으로 인한 오인식 방지)
          let sheetRowCount = 0;
          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length <= 3) continue; // D열(Index 3) 데이터가 존재해야 함

            const dVal = String(row[3] || '').trim(); // D열: 상품명 (앞 5글자 파싱 대상)
            const eVal = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : '공통'; // E열: 업장코드
            const jVal = row[9] !== undefined && row[9] !== null ? String(row[9]).trim() : '일반'; // J열: 권종구분
            
            // K열 (Index 10) 요금 할인 정보 - 오직 '식음' 시트일 때만 파싱하여 수집
            const discountVal = targetName === '식음' && row[10] !== undefined && row[10] !== null 
              ? String(row[10]).trim() 
              : null;

            if (dVal.length < 5) continue; // 접두어를 딸 수 없는 짧은 텍스트 패스

            const rawPrefix = dVal.substring(0, 5);
            const cleanPrefix = rawPrefix.toLowerCase();

            parsedData.push({
              prefix: cleanPrefix,
              unique_value: dVal,
              description: eVal,
              category: targetName, // 시트명 (대분류)
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

        // prefix + description + category + ticket_type 복합 기준으로 중복 제거
        const uniqueMap = new Map<string, QRMapping>();
        parsedData.forEach(item => {
          const key = `${item.prefix}:::${item.description || ''}:::${item.category || ''}:::${item.ticket_type || ''}`;
          // 동일한 복합 키인 경우 요금할인이 있는 데이터를 유지하거나 업데이트
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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanPrefix = manualPrefix.trim().substring(0, 5).toLowerCase(); // 소문자로 변환하여 저장
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
        }, { onConflict: 'prefix,description,category,ticket_type' }); // 복합 제약조건 타겟

      if (error) throw error;

      alert(`접두어 [${cleanPrefix.toUpperCase()}] 데이터가 성공적으로 등록/수정되었습니다.`);
      
      // Reset inputs
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
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

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

  // unique 한 권종구분 목록 동적 추출 (셀렉트 박스용)
  const uniqueTicketTypes = Array.from(
    new Set(mappingData.map(item => item.ticket_type).filter(Boolean))
  ) as string[];

  // 1. prefix 기준으로 그룹화 수행
  const groupedData = groupDataByPrefix(mappingData);

  // 2. 그룹화된 데이터를 필터 및 검색어로 필터링
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
        <h2>QR Verification Tool</h2>
        <p>카메라로 QR 코드를 스캔하고 5글자 접두어를 파싱하여 사전에 등록된 고유값을 실시간 조회합니다.</p>
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
          QR 코드 실시간 검증
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
          데이터 관리 및 업로드
        </button>
      </div>

      {/* TAB 1: SCANNER */}
      {activeTab === 'scan' && (
        <div className="scanner-section" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '1.5rem' }}>
            
            {/* Left/Top: Camera Scanner Container */}
            <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 600, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📷 카메라 실시간 스캔
              </h3>
              
              {!isScanning ? (
                <div className="text-center" style={{ 
                  padding: '2.5rem 0', 
                  width: '100%', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '20px'
                }}>
                  <QrCode size={48} style={{ color: '#3b82f6', marginBottom: '1.2rem', opacity: 0.8 }} />
                  <div style={{ marginBottom: '1.2rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                    카메라를 켜서 QR 코드를 스캔하세요.
                  </div>
                  <button 
                    className="scan-btn scan-btn-primary"
                    onClick={() => setIsScanning(true)}
                    style={{ margin: '0 auto' }}
                  >
                    카메라 스캔 켜기
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
                  
                  <div className="scan-controls" style={{ marginTop: '1rem' }}>
                    <button 
                      className="scan-btn scan-btn-secondary"
                      onClick={() => setIsScanning(false)}
                    >
                      카메라 끄기
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
              fontSize: '0.9rem',
              fontWeight: 600,
              margin: '0.5rem 0'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
              <span style={{ padding: '0 1rem' }}>또는</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
            </div>

            {/* Right/Bottom: Manual Code Input Lookup */}
            <div style={{ 
              width: '100%', 
              maxWidth: '480px', 
              background: 'rgba(255, 255, 255, 0.02)', 
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '20px',
              padding: '1.5rem',
              textAlign: 'center'
            }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                ✍️ 코드 직접 입력 조회
              </h3>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
                카메라가 없거나 인식이 안 되는 경우, 텍스트를 입력하여 조회합니다. (앞 5자리 파싱 대조)
              </p>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
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
                    padding: '0.7rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: '#ffffff',
                    color: '#000000',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
                <button 
                  onClick={() => {
                    if (!manualSearchText.trim()) return;
                    handleScanSuccess(manualSearchText);
                  }}
                  style={{
                    padding: '0 1.2rem',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: 'background 0.2s'
                  }}
                >
                  조회하기
                </button>
              </div>
            </div>

          </div>

          {/* Result Dialog Modal */}
          {scanResult && (
            <div className="result-overlay">
              <div className={`result-card ${scanResult.success ? 'result-success' : 'result-fail'}`}>
                <div className="result-icon">
                  {scanResult.success ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
                </div>

                <h3>{scanResult.success ? '검증 완료' : '검증 실패'}</h3>

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
            <div className="data-count">
              등록된 원시 데이터: <span>{totalCount}</span> 건 | 접두어 압축 목록: <span>{groupedData.length}</span> 건
            </div>
            
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button 
                className="qr-tab-btn" 
                onClick={fetchMappings} 
                style={{ padding: '0.5rem 1rem', margin: 0 }}
                disabled={isLoading}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                새로고침
              </button>
              
              {mappingData.length > 0 && (
                <button className="clear-btn" onClick={handleClearAll} disabled={isLoading}>
                  <Trash2 size={16} />
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

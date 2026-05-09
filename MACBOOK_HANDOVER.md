# 💻 맥북(MacBook) 인수인계서 (Handover Document)

> 이 문서는 윈도우 환경에서 작업하던 '시즌권 주문 추적 관리 도구' 구축의 현재 진행 상황과 다음 단계를 기록한 파일입니다. 맥북에서 안티그래비티(Antigravity)를 다시 여실 때 이 파일을 참조하라고 지시해 주시면 완벽하게 이어서 작업이 가능합니다.

---

## 1. 현재까지 완료된 작업 (Phase 1)
- **엑셀 파싱 완료**: `★★2026워터시즌권판매실적.xlsx` 파일의 `0508` 시트를 분석하여, 2025년 기준점 데이터(총 수량, 총 매출 등)를 추출하는 스크립트(`parse_baseline.cjs`) 작성을 완료했습니다.
- **기준점 데이터 확보**: 추출된 2025년 기준점 데이터는 `baseline_2025.json` 파일로 안전하게 저장되어 있습니다.
- **Supabase 업로드 스크립트 작성**: JSON 데이터를 Supabase DB에 주입하는 스크립트(`upload_baseline.cjs`) 작성을 완료했습니다.

## 2. 맥북에서 바로 진행해야 할 다음 작업 (Next Steps)
사용자님이 맥북 환경으로 이동하신 후, 아래 순서대로 진행해 주세요.

### [Step 1] Supabase 테이블 생성 (사용자 직접 수행)
1. 웹 브라우저를 열고 Supabase SQL Editor에 접속합니다.
   👉 [https://supabase.com/dashboard/project/fqjlsldmalvbikztzmis/sql/new](https://supabase.com/dashboard/project/fqjlsldmalvbikztzmis/sql/new)
2. 아래의 SQL 코드를 복사해서 넣고 **[Run]** 을 클릭합니다.

```sql
CREATE TABLE IF NOT EXISTS season_pass_baseline (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category1 VARCHAR(50), 
  category2 VARCHAR(50), 
  category3 VARCHAR(50), 
  target VARCHAR(50),    
  price NUMERIC,         
  qty_2025 NUMERIC,      
  revenue_2025 NUMERIC,  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS season_pass_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE NOT NULL, 
  order_date TIMESTAMP WITH TIME ZONE,    
  payment_date TIMESTAMP WITH TIME ZONE,  
  product_name VARCHAR(255),              
  recommender VARCHAR(100),               
  member_type VARCHAR(100),               
  customer_name VARCHAR(100),             
  ssn VARCHAR(50),                        
  phone VARCHAR(50),                      
  status VARCHAR(50) DEFAULT 'completed', 
  price NUMERIC,                          
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE season_pass_baseline DISABLE ROW LEVEL SECURITY;
ALTER TABLE season_pass_orders DISABLE ROW LEVEL SECURITY;
```

### [Step 2] 기준점 데이터 업로드 (안티그래비티에게 지시)
테이블 생성이 끝났다면, 맥북의 안티그래비티에게 이렇게 말씀해 주세요.
> "MACBOOK_HANDOVER.md 파일 읽어보고, Step 1까지 내가 직접 완료했으니 이제 `node upload_baseline.cjs` 실행해서 데이터 올리고 Phase 2(크롤러 개발)랑 Phase 3(대시보드 UI 개발) 이어서 진행해줘!"

---

## 3. 핵심 아키텍처 요약 (봇 컨텍스트 유지용)
- **목표**: 기존 수작업 엑셀 파일(워터시즌권판매실적)을 웹 대시보드로 자동화하고, 매일 09시에 최신화된 엑셀 파일을 다운로드하는 기능 구현.
- **주요 파일**: 
  - `parse_baseline.cjs`: 엑셀에서 작년 기준 데이터 뽑기
  - `upload_baseline.cjs`: 뽑은 데이터 DB 업로드
  - `implementation_plan.md` & `task.md`: 앞으로의 작업 계획 및 체크리스트
- **주의사항**: 프론트엔드 작업 시, 엑셀 다운로드는 `xlsx` 라이브러리를 활용하여 기존 엑셀 양식을 100% 동일하게 재현해야 합니다.

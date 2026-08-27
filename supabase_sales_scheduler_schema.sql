-- 판매 스케줄러 · 수기 실적 트래커 확장

CREATE TABLE IF NOT EXISTS sales_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('direct', 'wholesale', 'ota', 'other')),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, name)
);

CREATE TABLE IF NOT EXISTS sales_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('direct', 'wholesale', 'ota', 'other')),
  company_id uuid REFERENCES sales_companies(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  sales_start date NOT NULL,
  sales_end date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  purchase_quantity integer NOT NULL DEFAULT 0,
  purchase_amount numeric NOT NULL DEFAULT 0,
  cancel_quantity integer NOT NULL DEFAULT 0,
  cancel_amount numeric NOT NULL DEFAULT 0,
  net_quantity integer NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  memo text,
  color text NOT NULL DEFAULT 'blue',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '사용자',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_product_period CHECK (sales_end >= sales_start)
);

CREATE TABLE IF NOT EXISTS sales_daily_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES sales_products(id) ON DELETE CASCADE,
  result_date date NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  memo text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '사용자',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, result_date)
);

CREATE TABLE IF NOT EXISTS sales_product_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES sales_products(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_products_dates_idx ON sales_products(sales_start, sales_end);
CREATE INDEX IF NOT EXISTS sales_results_product_date_idx ON sales_daily_results(product_id, result_date);

-- 외부 캘린더 가져오기 시 원본 일정과 상세 이력을 보존합니다.
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS source_uid text;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS source_status text;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS source_created_at timestamptz;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS source_calendar_name text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_products_source_uid_unique ON sales_products(source_uid) WHERE source_uid IS NOT NULL;

-- 기존 판매 상품에도 최종 실적 칼럼을 추가합니다.
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS purchase_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS purchase_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS cancel_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS cancel_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS net_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE sales_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_daily_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_product_files ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE current_table text;
BEGIN
  FOREACH current_table IN ARRAY ARRAY['sales_companies', 'sales_products', 'sales_daily_results', 'sales_product_files'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = current_table AND policyname = 'authenticated sales workspace access') THEN
      EXECUTE format('CREATE POLICY "authenticated sales workspace access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', current_table);
    END IF;
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-proposals', 'product-proposals', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'authenticated product proposal storage') THEN
    CREATE POLICY "authenticated product proposal storage" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'product-proposals')
    WITH CHECK (bucket_id = 'product-proposals');
  END IF;
END $$;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_companies; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_products; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_daily_results; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_product_files; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

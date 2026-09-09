-- 나이스페이 부가세 정산 STEP 3 설정값. 원본 거래 데이터는 저장하지 않습니다.

CREATE TABLE IF NOT EXISTS public.nicepay_vat_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority integer NOT NULL DEFAULT 100,
  include_keywords text[] NOT NULL DEFAULT '{}',
  exclude_keywords text[] NOT NULL DEFAULT '{}',
  standard_product_name text NOT NULL DEFAULT '',
  package_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nicepay_vat_rule_keywords_required CHECK (cardinality(include_keywords) > 0)
);

CREATE TABLE IF NOT EXISTS public.nicepay_vat_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  excel_column text NOT NULL UNIQUE,
  display_order integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nicepay_vat_facility_column CHECK (excel_column ~ '^[A-Z]{1,3}$')
);

CREATE TABLE IF NOT EXISTS public.nicepay_vat_package_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name text NOT NULL,
  facility_name text NOT NULL REFERENCES public.nicepay_vat_facilities(name) ON UPDATE CASCADE,
  base_amount numeric(18,2) NOT NULL CHECK (base_amount > 0),
  start_date date,
  end_date date,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nicepay_vat_component_date_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS nicepay_vat_rules_priority_idx ON public.nicepay_vat_classification_rules(priority, enabled);
CREATE INDEX IF NOT EXISTS nicepay_vat_components_package_idx ON public.nicepay_vat_package_components(package_name, enabled, start_date, end_date);

ALTER TABLE public.nicepay_vat_classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nicepay_vat_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nicepay_vat_package_components ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['nicepay_vat_classification_rules', 'nicepay_vat_facilities', 'nicepay_vat_package_components'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'approved app users only', target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_active_app_access()) WITH CHECK (public.has_active_app_access())', 'approved app users only', target_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.touch_nicepay_vat_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nicepay_vat_rules_updated_at ON public.nicepay_vat_classification_rules;
CREATE TRIGGER nicepay_vat_rules_updated_at BEFORE UPDATE ON public.nicepay_vat_classification_rules FOR EACH ROW EXECUTE FUNCTION public.touch_nicepay_vat_updated_at();
DROP TRIGGER IF EXISTS nicepay_vat_facilities_updated_at ON public.nicepay_vat_facilities;
CREATE TRIGGER nicepay_vat_facilities_updated_at BEFORE UPDATE ON public.nicepay_vat_facilities FOR EACH ROW EXECUTE FUNCTION public.touch_nicepay_vat_updated_at();
DROP TRIGGER IF EXISTS nicepay_vat_components_updated_at ON public.nicepay_vat_package_components;
CREATE TRIGGER nicepay_vat_components_updated_at BEFORE UPDATE ON public.nicepay_vat_package_components FOR EACH ROW EXECUTE FUNCTION public.touch_nicepay_vat_updated_at();

NOTIFY pgrst, 'reload schema';

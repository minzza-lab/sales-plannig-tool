import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix2025() {
  const { data, error } = await supabase
    .from('daily_reports')
    .update({ report_type: 'CUSTOMER_TYPE' })
    .eq('report_type', 'RATE_ZONE')
    .gte('report_date', '2025-01-01')
    .lte('report_date', '2025-12-31');

  if (error) {
    console.error('Error updating:', error);
  } else {
    console.log('Successfully updated 2025 RATE_ZONE to CUSTOMER_TYPE');
  }
}

fix2025();

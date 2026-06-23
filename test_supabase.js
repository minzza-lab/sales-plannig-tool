import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('package_orders').select('*').neq('reservation_date', '');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Rows with reservation_date:", data.length);
  }
}

test();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('approvals').select('id, title, file_name, doc_date');
  if (error) {
    console.error(error);
  } else {
    console.log("Total records:", data.length);
    const seasonMatches = data.filter(d => 
      (d.title || '').includes('시즌') || 
      (d.file_name || '').includes('시즌')
    );
    console.log("Matches for '시즌':", seasonMatches.length);
    console.log(seasonMatches);
  }
}
check();

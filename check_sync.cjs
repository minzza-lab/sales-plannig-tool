require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('knowledge_base').select('*').eq('title', '[SYSTEM] LAST_SYNC');
  console.log('Result:', data, error);
}

check();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('knowledge_base').insert({ title: 'test', content: 'test', category: 'test' });
  console.log('Error:', error);
}
checkSchema();

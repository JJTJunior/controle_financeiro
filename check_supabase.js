import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSelectPolicy() {
  const email = 'teste_usuario_financeiro_312053@gmail.com';
  const password = 'password123';

  console.log('1. Signing in test user:', email);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error('Sign in failed:', authError);
    return;
  }

  const user = authData.user;
  console.log('Successfully signed in user with ID:', user.id);

  console.log('2. Trying to query own user_data (should return empty array or PGRST116, but not RLS error)...');
  const { data: ownData, error: ownError } = await supabase
    .from('user_data')
    .select('*')
    .eq('id', user.id);

  if (ownError) {
    console.error('Own query error:', ownError);
  } else {
    console.log('Own query successful! Found rows:', ownData.length);
  }

  console.log('3. Trying to query ALL rows from user_data (checking if we can see other users)...');
  const { data: allData, error: allError } = await supabase
    .from('user_data')
    .select('*');

  if (allError) {
    console.error('All rows query error:', allError);
  } else {
    console.log('All rows query successful! Found rows:', allData.length);
    allData.forEach((row, i) => {
      console.log(`  Row ${i + 1}: id=${row.id}`);
      console.log(`  Row data:`, row.data ? Object.keys(row.data) : 'null');
    });
  }
}

testSelectPolicy();

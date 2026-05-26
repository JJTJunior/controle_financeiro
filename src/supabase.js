import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('[Supabase] URL:', supabaseUrl)
console.log('[Supabase] Key exists:', !!supabaseAnonKey)

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] ERRO: Variáveis de ambiente não encontradas! Reinicie o servidor Vite.')
  alert('ERRO: Chaves do Supabase não encontradas. Pare o servidor (Ctrl+C) e rode "npm run dev" novamente.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

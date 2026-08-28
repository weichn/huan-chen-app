import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '缺少 Supabase 環境變數，請確認 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY 已正確設定'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

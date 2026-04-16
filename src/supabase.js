import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gvudgmgeaxtzemirswuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2dWRnbWdlYXh0emVtaXJzd3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTk3NjIsImV4cCI6MjA5MTg5NTc2Mn0.0NqVQgIiV8DGX6FMjvYmgBMtVBuabOMpowvrc0Xb2bg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

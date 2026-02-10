import { supabase } from '../supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Failed to create account')

  if (fullName) {
    await supabase
      .from('profiles')
      .update({ full_name: fullName, worker_status: 'inactive' })
      .eq('id', data.user.id)
  }

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)
  return session
}

export async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

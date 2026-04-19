import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Profile } from '../types/profile'
import { supabase } from '../integrations/supabase/client'
import { getSessionProfile, signInLocal, signOutLocal, signUpLocal } from '../lib/rewear-store'

type AuthContextValue = {
  user: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Profile>
  signUp: (input: { email: string; password: string; displayName?: string }) => Promise<Profile>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void refreshUser()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function refreshUser(): Promise<void> {
    setLoading(true)
    try {
      const nextUser = await getSessionProfile()
      startTransition(() => {
        setUser(nextUser)
      })
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email: string, password: string): Promise<Profile> {
    const nextUser = await signInLocal(email, password)
    startTransition(() => {
      setUser(nextUser)
    })
    return nextUser
  }

  async function signUp(input: { email: string; password: string; displayName?: string }): Promise<Profile> {
    const nextUser = await signUpLocal(input)
    startTransition(() => {
      setUser(nextUser)
    })
    return nextUser
  }

  async function signOut(): Promise<void> {
    await signOutLocal()
    startTransition(() => {
      setUser(null)
    })
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}

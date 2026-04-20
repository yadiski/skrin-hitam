'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signToken, verifyPassword, ADMIN_COOKIE_NAME } from '@/lib/auth'

export async function loginAction(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!verifyPassword(password)) {
    redirect('/admin/login?error=1')
  }
  const token = await signToken('admin')
  const cookieStore = await cookies()
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  redirect('/admin')
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
  redirect('/admin/login')
}

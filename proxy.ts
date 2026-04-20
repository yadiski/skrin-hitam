import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE_NAME } from '@/lib/auth'

export const config = {
  matcher: ['/admin/:path*'],
}

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/admin/login') return NextResponse.next()
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.redirect(new URL('/admin/login', req.url))
  const sub = await verifyToken(cookie)
  if (!sub) return NextResponse.redirect(new URL('/admin/login', req.url))
  return NextResponse.next()
}

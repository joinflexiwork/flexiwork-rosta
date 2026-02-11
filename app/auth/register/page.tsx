import { redirect } from 'next/navigation'

/** Register is integrated into login page - redirect to login with signup tab */
export default function RegisterPage() {
  redirect('/auth/login?tab=signup')
}

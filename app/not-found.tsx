import { redirect } from 'next/navigation'

/** Equivalente a <Route path="*" element={<Navigate to="/" replace />} /> del prototipo. */
export default function NotFound() {
  redirect('/')
}

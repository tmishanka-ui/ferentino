import { notFound } from 'next/navigation';
import { sectionById } from '@/lib/registry';

// The working app itself is shown by the application shell (components/Chrome.tsx); this route only has to exist and be valid.
export default async function Department({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  if (!sectionById(dept)) notFound();
  return null;
}

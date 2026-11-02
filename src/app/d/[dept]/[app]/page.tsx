import { notFound } from 'next/navigation';
import { sectionById } from '@/lib/registry';

export default async function DepartmentApp({ params }: { params: Promise<{ dept: string; app: string }> }) {
  const { dept, app } = await params;
  const s = sectionById(dept);
  if (!s || !s.tabs.some((t) => t[0] === app)) notFound();
  return null;
}

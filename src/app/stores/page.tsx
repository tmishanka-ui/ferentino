import { redirect } from 'next/navigation';

const TABS = ['receive', 'issue', 'stock', 'movements', 'employees', 'backup'];

export default async function StoresIndex({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect('/stores/' + (tab && TABS.includes(tab) ? tab : 'receive'));
}

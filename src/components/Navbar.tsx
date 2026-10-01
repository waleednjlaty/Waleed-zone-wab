import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCategories } from '@/lib/queries';

export default async function Navbar() {
  const [user, categories] = await Promise.all([getCurrentUser(), getCategories()]);
  return <Suspense><Navigation signedIn={Boolean(user)} categories={categories} /></Suspense>;
}

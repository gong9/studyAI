'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 教研库列表页 - 重定向到主 dashboard
 * 现在 /dashboard 就是教研库主页
 */
export default function TeachingDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}

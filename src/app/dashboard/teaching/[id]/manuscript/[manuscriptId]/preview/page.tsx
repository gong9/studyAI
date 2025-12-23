'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * 预览页面 - 自动重定向到演示页面
 * 保留此页面是为了兼容旧链接
 */
export default function SlidevPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const manuscriptId = params.manuscriptId as string;
  const kbId = params.id as string;

  useEffect(() => {
    // 自动重定向到演示页面
    router.replace(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
  }, [router, kbId, manuscriptId]);
      
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <div className="text-center">
        <div className="h-10 w-10 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-zinc-400">正在跳转到演示模式...</p>
      </div>
    </div>
  );
}

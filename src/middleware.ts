export { default } from 'next-auth/middleware';

export const config = {
  // 匹配所有路径，排除：首页、登录、注册、分享、API、静态资源
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|models|templates|login|register|share|$).*)',
  ],
};


'use client';

// @ts-ignore
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ArrowRight,
  ChevronDown,
  Sparkles,
  FileText,
  ListTree,
  Target,
  Mic,
  MessageSquare,
  FileSearch,
  Image,
  Presentation,
  Download,
  Eye,
  Cpu,
  Layers,
  Zap,
  FileCheck,
  Clock,
  CheckCircle,
  Play,
  Radio,
  Film,
  Users,
  Building2,
  Scale
} from 'lucide-react';

// 三大场景 - 统一采用 Zinc-900 主色调逻辑
const scenarios = [
  { 
    id: 'tech',
    icon: Cpu, 
    name: '技术培训', 
    desc: '产品文档、技术手册，快速转化为 AI 培训课程',
    highlight: '企业技术',
    examples: ['技术入门', '产品功能', '接口讲解'],
  },
  { 
    id: 'policy',
    icon: FileCheck, 
    name: '制度培训', 
    desc: '规章制度、员工手册，合规培训一键生成',
    highlight: '合规培训',
    examples: ['入职培训', '安全规范', '流程宣贯'],
  },
  { 
    id: 'legal',
    icon: Scale, 
    name: '普法讲座', 
    desc: '法律条文转化为通俗易懂的科普讲座',
    highlight: '法律普及',
    examples: ['劳动法', '民法典', '消费维权'],
  },
];

// 核心功能 - 统一配色
const preparationFeatures = [
  { icon: ListTree, name: '智能章节提取', desc: 'AI 自动识别文档目录结构' },
  { icon: Target, name: '方案智能规划', desc: '自动生成培训目标与重难点' },
  { icon: FileText, name: '手稿自动生成', desc: '基于文档生成结构化讲稿' },
  { icon: FileSearch, name: '智能审核优化', desc: 'AI 审核手稿给出修改建议' },
];

const teachingFeatures = [
  { icon: Presentation, name: 'PPT 自动生成', desc: '一键生成精美演示课件' },
  { icon: Mic, name: '语音合成 TTS', desc: '真人级语音，多种音色可选' },
  { icon: MessageSquare, name: '1对1私教互动', desc: '随时打断提问，AI 即时解答' },
  { icon: Download, name: '课程导出分享', desc: '一键导出视频，轻松分享传播' },
];

const exportFeatures = [
  { icon: Image, name: 'AI 配图生成', desc: '自动生成教学示意图' },
  { icon: Presentation, name: 'PPT 自动渲染', desc: 'Slidev 驱动精美课件' },
  { icon: Download, name: '视频一键导出', desc: '支持 MP4 高清培训视频' },
  { icon: Eye, name: '实时在线预览', desc: '实时预览课件讲解效果' },
];

const workflowSteps = [
  { step: '1', title: '上传文档', desc: '支持 PDF、DOCX、TXT' },
  { step: '2', title: '智能扫描', desc: 'AI 识别内容结构' },
  { step: '3', title: '选择章节', desc: '定制化生成范围' },
  { step: '4', title: 'AI 规划', desc: '生成培训大纲' },
  { step: '5', title: '生成内容', desc: '撰写讲稿与 PPT' },
  { step: '6', title: '演示输出', desc: '直播讲解 / 视频导出' },
];

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "StudyAI - 一站式 AI 内容演示平台";
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.scroll-fade-in').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-zinc-900 overflow-x-hidden selection:bg-zinc-900 selection:text-white font-sans">
      {/* 极简背景层 */}
      <div className="fixed inset-0 -z-10 bg-zinc-50/50">
        <div className="absolute inset-0 bg-grid-visible opacity-100" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_1000px_at_50%_-100px,#00000008,transparent)]" />
      </div>

      {/* 导航栏 - 对齐 Dashboard */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex items-center justify-center group">
              <div className="absolute inset-0 bg-zinc-900 rounded-lg transform rotate-3 transition-transform group-hover:rotate-6"></div>
              <div className="absolute inset-0 bg-zinc-900 rounded-lg opacity-20 transform -rotate-3 transition-transform group-hover:-rotate-6"></div>
              <Sparkles className="relative w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-zinc-900">StudyAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="px-5 py-2 bg-zinc-900 text-white rounded-full text-sm font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200">
              立即开始
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero 区域 - 极简大气 */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-16">
        <div className="text-center max-w-5xl mx-auto flex flex-col items-center w-full" style={{ opacity: Math.max(0, 1 - scrollY / 600) }}>
          <div className="animate-slide-up w-full">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full border border-zinc-200 bg-white/50 backdrop-blur-sm text-xs font-bold text-zinc-500 mb-8 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2 animate-pulse"></span>
              一站式 AI 内容数字化演示平台
            </span>
            <h1 className="text-6xl sm:text-8xl lg:text-[10rem] font-black tracking-tighter mb-8 text-zinc-900 leading-[0.9]">
              StudyAI
              <span className="inline-block ml-4 text-2xl sm:text-4xl font-normal text-zinc-300 tracking-normal italic">AI</span>
            </h1>
          </div>
          
          <p className="text-xl sm:text-3xl text-zinc-500 mb-10 animate-slide-up font-medium tracking-tight max-w-3xl leading-relaxed">
            让每份文档都转化为<span className="text-zinc-900 border-b-4 border-zinc-200 mx-1">专业级</span>的 AI 互动演示
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up w-full sm:w-auto px-4" style={{ animationDelay: '0.2s' }}>
            <Link href="/login" className="group px-10 py-4 bg-zinc-900 text-white rounded-2xl text-lg font-bold hover:bg-zinc-800 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-zinc-300 flex items-center justify-center gap-2">
              开始创作
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="#scenarios" className="px-10 py-4 bg-white border border-zinc-200 text-zinc-600 rounded-2xl text-lg font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2">
              查看场景
            </Link>
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-8 h-8 text-zinc-300" />
        </div>
      </section>

      {/* 核心应用场景 - 纯净白灰风 */}
      <section id="scenarios" className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24 scroll-fade-in">
            <h2 className="text-4xl sm:text-5xl font-black mb-6 text-zinc-900 uppercase tracking-tighter">适用培训场景</h2>
            <p className="text-zinc-400 text-lg font-medium max-w-2xl mx-auto">针对不同领域，提供极致的 AI 内容转化方案</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {scenarios.map((scenario, index) => (
              <div key={scenario.id} className="scroll-fade-in bg-white border border-zinc-100 rounded-[2.5rem] p-10 hover:border-zinc-900 hover:shadow-2xl transition-all duration-500 group">
                <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-8 shadow-xl group-hover:scale-110 transition-transform">
                  <scenario.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-3xl font-black mb-4 text-zinc-900">{scenario.name}</h3>
                <p className="text-zinc-500 text-base font-medium mb-8 leading-relaxed">{scenario.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {scenario.examples.map((ex, i) => (
                    <span key={i} className="text-[11px] font-bold px-3 py-1 bg-zinc-100 text-zinc-500 rounded-full border border-zinc-200/50 uppercase tracking-wider">{ex}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 直播与录播模式 - 强对比设计 */}
      <section className="relative py-32 px-6 bg-zinc-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.03]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="scroll-fade-in">
              <h2 className="text-5xl sm:text-6xl font-black mb-8 leading-tight tracking-tighter">
                双模式演示<br />
                <span className="text-zinc-500 italic">满足一切可能</span>
              </h2>
              <p className="text-zinc-400 text-lg font-medium mb-12">无论是一对一的实时私教互动，还是面向大众的高清视频分享，AI 都能完美胜任。</p>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-6 bg-white/[0.03] border border-white/10 rounded-3xl hover:bg-white/[0.05] transition-colors group">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Radio className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white">直播模式</h4>
                    <p className="text-zinc-500 font-medium">1对1私教互动，随时打断提问，AI 实时应答</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-6 bg-white/[0.03] border border-white/10 rounded-3xl hover:bg-white/[0.05] transition-colors group">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Film className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white">录播模式</h4>
                    <p className="text-zinc-500 font-medium">一键生成高清演示视频，支持多平台导出分享</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="scroll-fade-in lg:block hidden">
              <div className="relative aspect-video rounded-[2rem] bg-zinc-800 border border-white/10 shadow-2xl overflow-hidden group">
                {/* 模拟幻灯片背景 */}
                <div className="absolute inset-0 bg-white m-2 rounded-[1.5rem] overflow-hidden flex flex-col">
                  {/* PPT 头部 */}
                  <div className="h-12 bg-zinc-50 border-b border-zinc-100 px-6 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-200" />
                      <div className="w-2 h-2 rounded-full bg-zinc-200" />
                      <div className="w-2 h-2 rounded-full bg-zinc-200" />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Lesson 01: 深度学习基础</span>
                  </div>
                  
                  {/* PPT 内容区 */}
                  <div className="flex-1 p-8">
                    <div className="space-y-6">
                      <div className="h-8 w-2/3 bg-zinc-900 rounded-lg flex items-center px-4">
                        <div className="h-2 w-full bg-white/20 rounded-full" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="aspect-video bg-zinc-50 rounded-xl border border-zinc-100 p-4 flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="h-2 w-full bg-zinc-200 rounded-full" />
                            <div className="h-2 w-2/3 bg-zinc-200 rounded-full" />
                          </div>
                          <div className="h-8 w-8 bg-zinc-900 rounded-lg" />
                        </div>
                        <div className="aspect-video bg-zinc-900 rounded-xl p-4 flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-white opacity-20" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                            <CheckCircle className="w-2.5 h-2.5 text-white" />
                          </div>
                          <div className="h-2 w-1/2 bg-zinc-100 rounded-full" />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full bg-zinc-100" />
                          <div className="h-2 w-1/3 bg-zinc-100 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI 老师气泡 - 模拟 1对1 */}
                  <div className="absolute bottom-6 right-6 w-32 h-32 rounded-2xl bg-zinc-900 shadow-2xl border-4 border-white overflow-hidden group-hover:scale-110 transition-transform">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <Users className="w-10 h-10 text-white/20" />
                      <div className="mt-2 flex gap-1">
                        <div className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse" />
                        <div className="w-1 h-6 bg-emerald-400 rounded-full animate-pulse delay-75" />
                        <div className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse delay-150" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-emerald-500 rounded text-[8px] font-black text-white uppercase">AI Teacher</div>
                  </div>

                  {/* 模拟互动提问弹窗 */}
                  <div className="absolute top-24 right-40 w-48 bg-white shadow-2xl border border-zinc-100 rounded-2xl p-4 animate-bounce-slow">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center text-[8px] font-bold">ZS</div>
                      <span className="text-[10px] font-bold text-zinc-900">张同学 提问:</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">"这里的权重参数是如何初始化的？"</p>
                    <div className="mt-2 pt-2 border-t border-zinc-50 flex justify-end">
                      <span className="text-[8px] font-black text-emerald-500 uppercase">AI 正在回答...</span>
                    </div>
                  </div>
                </div>

                {/* 底部控制条 */}
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/40 backdrop-blur-md px-6 flex items-center gap-4">
                  <Play className="w-4 h-4 text-white fill-white" />
                  <div className="flex-1 h-1 bg-white/20 rounded-full relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-1/3 bg-emerald-500" />
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-white/40" />
                    <div className="w-2 h-2 rounded-full bg-white/40" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 核心技术板块 - 三排式极简网格 */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-24 scroll-fade-in">
            <h2 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter">内容引擎能力</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {preparationFeatures.map((f, i) => (
              <div key={i} className="scroll-fade-in group">
                <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-zinc-900 transition-colors">
                  <f.icon className="w-6 h-6 text-zinc-400 group-hover:text-white" />
                </div>
                <h4 className="text-xl font-bold text-zinc-900 mb-3">{f.name}</h4>
                <p className="text-zinc-500 text-sm font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          
          <div className="h-px bg-zinc-100 my-16" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teachingFeatures.map((f, i) => (
              <div key={i} className="scroll-fade-in group">
                <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-zinc-900 transition-colors">
                  <f.icon className="w-6 h-6 text-zinc-400 group-hover:text-white" />
                </div>
                <h4 className="text-xl font-bold text-zinc-900 mb-3">{f.name}</h4>
                <p className="text-zinc-500 text-sm font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 极简 Footer */}
      <footer className="py-24 px-6 border-t border-zinc-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <div className="relative w-12 h-12 flex items-center justify-center mb-8 group">
            <div className="absolute inset-0 bg-zinc-900 rounded-xl transform rotate-3"></div>
            <Sparkles className="relative w-6 h-6 text-white" />
          </div>
          <h2 className="text-4xl font-black text-zinc-900 mb-6 tracking-tighter">开始创作您的内容</h2>
          <p className="text-zinc-400 text-lg font-medium mb-12">释放 AI 的力量，让内容传递更具价值</p>
          <Link href="/login" className="px-12 py-4 bg-zinc-900 text-white rounded-2xl text-lg font-bold hover:bg-zinc-800 transition-all hover:shadow-2xl">
            立即体验
          </Link>
          
          <div className="mt-24 pt-8 border-t border-zinc-50 w-full flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] font-bold text-zinc-300 uppercase tracking-widest">
            <span>© 2025 StudyAI · 一站式 AI 内容演示</span>
            <div className="flex gap-8">
              <span className="hover:text-zinc-900 cursor-pointer">Privacy</span>
              <span className="hover:text-zinc-900 cursor-pointer">Terms</span>
              <span className="hover:text-zinc-900 cursor-pointer">Twitter</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

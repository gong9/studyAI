'use client';

// @ts-ignore
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { 
  BookOpen,
  ArrowRight,
  ChevronDown,
  Sparkles,
  FileText,
  ListTree,
  Target,
  Mic,
  Highlighter,
  MessageSquare,
  Wand2,
  FileSearch,
  ClipboardList,
  Image,
  Presentation,
  Download,
  Eye,
  Cpu,
  Layers,
  Zap,
  GraduationCap,
  Users,
  Clock,
  CheckCircle,
  Play
} from 'lucide-react';

// 智能备课引擎功能
const preparationFeatures = [
  { icon: ListTree, name: '智能章节提取', desc: 'LLM 自动识别教材目录结构' },
  { icon: Target, name: '教学方案规划', desc: '自动生成教学目标与重难点' },
  { icon: FileText, name: '手稿自动生成', desc: '基于教材生成结构化讲稿' },
  { icon: FileSearch, name: '智能审核优化', desc: 'AI 审核手稿给出修改建议' },
];

// AI 老师讲解功能
const teachingFeatures = [
  { icon: ClipboardList, name: '演讲稿生成', desc: '口语化、启发式的讲解稿' },
  { icon: Highlighter, name: '元素高亮联动', desc: '讲到哪里亮哪里，同步演示' },
  { icon: Mic, name: '语音合成 TTS', desc: '真人级语音，多种音色可选' },
  { icon: MessageSquare, name: '互动引导语', desc: '自动添加课堂互动引导' },
];

// AI 辅助编辑功能
const editingFeatures = [
  { icon: Wand2, name: '文案润色', desc: '优化表达更适合教学场景' },
  { icon: BookOpen, name: '内容扩写', desc: '补充例子、解释、练习' },
  { icon: MessageSquare, name: '智能问答', desc: '基于教材 RAG 检索回答' },
  { icon: FileText, name: '摘要生成', desc: '快速生成知识点提纲' },
];

// 课件生成功能
const exportFeatures = [
  { icon: Image, name: 'AI 配图生成', desc: '自动生成教学示意图' },
  { icon: Presentation, name: 'PPT 自动渲染', desc: 'Slidev 驱动精美课件' },
  { icon: Download, name: '一键导出', desc: '支持 PPTX、PDF 格式' },
  { icon: Eye, name: '在线预览', desc: '实时预览课件效果' },
];

// 工作流程步骤
const workflowSteps = [
  { step: '1', title: '上传教材', desc: '支持 PDF、DOCX、TXT 格式' },
  { step: '2', title: '智能扫描', desc: 'AI 自动识别章节结构' },
  { step: '3', title: '选择章节', desc: '选择需要备课的内容' },
  { step: '4', title: 'AI 规划', desc: '生成教学方案与目标' },
  { step: '5', title: '生成手稿', desc: 'AI 撰写教学讲稿' },
  { step: '6', title: 'AI 授课', desc: 'AI 老师演讲 + PPT 同步' },
];

// 技术亮点
const techHighlights = [
  { icon: Cpu, name: 'Agentic RAG', desc: '深度检索与推理' },
  { icon: Layers, name: '多模态理解', desc: '文本、图像、结构' },
  { icon: Zap, name: '实时流式', desc: '边生成边展示' },
];

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "智研课堂 - AI 教研助手";
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const elements = document.querySelectorAll('.scroll-fade-in');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-zinc-900 overflow-x-hidden selection:bg-zinc-900 selection:text-white">
      {/* 固定背景层 */}
      <div className="fixed inset-0 -z-10 bg-zinc-50/50">
        <div className="absolute inset-0 bg-grid-visible opacity-100" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-multiply" />
        
        {/* 流光效果 */}
        <div className="beam-line left-[20%] animate-beam-v delay-1000" />
        <div className="beam-line left-[50%] animate-beam-v delay-3000 bg-gradient-to-b from-transparent via-zinc-600 to-transparent shadow-zinc-500/50" />
        <div className="beam-line left-[80%] animate-beam-v delay-5000 bg-gradient-to-b from-transparent via-zinc-500 to-transparent shadow-zinc-400/50" />

        <div className="beam-line-h top-[30%] animate-beam-h delay-2000 bg-gradient-to-r from-transparent via-zinc-600 to-transparent shadow-zinc-500/50" />
        <div className="beam-line-h top-[70%] animate-beam-h delay-4000 bg-gradient-to-r from-transparent via-zinc-500 to-transparent shadow-zinc-400/50" />

        {/* 呼吸光点 */}
        <div className="absolute top-[15%] left-[20%] w-3 h-3 bg-zinc-500 rounded-full animate-blink opacity-0 shadow-[0_0_20px_rgba(113,113,122,0.8)]" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[35%] right-[25%] w-3 h-3 bg-zinc-400 rounded-full animate-blink opacity-0 shadow-[0_0_20px_rgba(161,161,170,0.8)]" style={{ animationDelay: '3s' }} />
        
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_800px_at_50%_-100px,#a1a1aa0a,transparent)]" />
      </div>

      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-zinc-900 rounded-lg transform rotate-3 transition-transform group-hover:rotate-6"></div>
                <div className="absolute inset-0 bg-zinc-900 rounded-lg opacity-20 transform -rotate-3 transition-transform group-hover:-rotate-6"></div>
                <GraduationCap className="relative w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="font-bold text-lg sm:text-xl tracking-tight text-zinc-900">智研课堂</span>
            </div>
            
            <div className="flex items-center gap-3 sm:gap-4">
              <Link 
                href="/login"
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
              >
                登录
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero 区域 */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-16 overflow-hidden">
        {/* 浮动装饰 */}
        <div 
          className="hidden lg:flex absolute top-32 left-[10%] w-20 h-20 bg-white border border-zinc-200 shadow-xl shadow-zinc-200/50 rounded-2xl items-center justify-center animate-float-slow"
          style={{ opacity: Math.max(0, 1 - scrollY / 400) }}
        >
          <GraduationCap className="w-8 h-8 text-zinc-800" />
        </div>
        
        <div 
          className="hidden lg:flex absolute top-48 right-[15%] w-16 h-16 bg-zinc-50 border border-zinc-200 shadow-xl shadow-zinc-200/50 rounded-xl items-center justify-center animate-float-delayed"
          style={{ opacity: Math.max(0, 1 - scrollY / 400) }}
        >
          <Sparkles className="w-6 h-6 text-zinc-600" />
        </div>
        
        <div 
          className="hidden lg:flex absolute bottom-32 left-[20%] w-14 h-14 bg-white border border-zinc-200 shadow-lg shadow-zinc-200/50 rounded-lg items-center justify-center animate-float-slow"
          style={{ opacity: Math.max(0, 1 - scrollY / 400) }}
        >
          <Presentation className="w-5 h-5 text-zinc-700" />
        </div>

        {/* 主标题 */}
        <div 
          className="text-center max-w-4xl mx-auto flex flex-col items-center w-full"
          style={{ opacity: Math.max(0, 1 - scrollY / 600) }}
        >
          <div className="animate-slide-up w-full">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 bg-white/50 backdrop-blur-sm text-xs sm:text-sm font-medium text-zinc-600 mb-6 sm:mb-8 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2 animate-pulse"></span>
              AI 驱动的智能教研系统
            </span>
            <h1 className="text-5xl sm:text-7xl lg:text-9xl font-black tracking-tighter mb-6 text-zinc-900 relative z-10 leading-tight">
              智研课堂
              <span className="absolute -top-3 -right-4 sm:-top-4 sm:-right-8 text-sm sm:text-2xl font-normal text-zinc-400 tracking-normal border border-zinc-200 px-1.5 sm:px-2 py-0.5 rounded-lg rotate-12 bg-white/50">AI</span>
            </h1>
          </div>
          
          <p 
            className="text-lg sm:text-4xl text-zinc-600 mb-6 animate-slide-up font-light tracking-tight max-w-[90%] sm:max-w-none leading-relaxed"
            style={{ animationDelay: '0.1s' }}
          >
            让每位老师都拥有<span className="font-semibold text-zinc-900 mx-1 sm:mx-2 border-b-2 sm:border-b-4 border-zinc-200/80">AI 教学助理</span>
          </p>
          
          <p 
            className="text-sm sm:text-lg text-zinc-400 mb-10 sm:mb-12 animate-slide-up font-mono bg-zinc-50 px-3 sm:px-4 py-2 rounded-lg border border-zinc-100/50 max-w-[95%] sm:max-w-none"
            style={{ animationDelay: '0.2s' }}
          >
            上传教材 → AI 智能分析 → 一键生成课件 → AI 老师讲解
          </p>
          
          <div 
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-slide-up w-full sm:w-auto px-4 sm:px-0"
            style={{ animationDelay: '0.3s' }}
          >
            <Link 
              href="/login"
              className="group px-6 sm:px-8 py-3.5 sm:py-4 bg-zinc-900 text-white rounded-lg text-base sm:text-lg font-medium hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-500/20 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              开始备课
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link 
              href="#features"
              className="px-6 sm:px-8 py-3.5 sm:py-4 bg-white border border-zinc-200 text-zinc-700 rounded-lg text-base sm:text-lg font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
              了解更多
            </Link>
          </div>
        </div>

        {/* 向下滚动提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-zinc-300" />
        </div>
      </section>

      {/* 核心数据展示 */}
      <section className="relative py-12 sm:py-16 px-4 bg-zinc-900 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { value: '4', label: '大核心模块', icon: Layers },
              { value: '16+', label: 'AI 能力', icon: Sparkles },
              { value: '60s', label: '生成一节课', icon: Clock },
              { value: '∞', label: '创意可能', icon: Zap },
            ].map((stat, i) => (
              <div key={i} className="scroll-fade-in" style={{ transitionDelay: `${i * 100}ms` }}>
                <stat.icon className="w-6 h-6 mx-auto mb-2 text-zinc-400" />
                <div className="text-3xl sm:text-4xl font-black mb-1">{stat.value}</div>
                <div className="text-xs sm:text-sm text-zinc-400 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能模块一：智能备课引擎 */}
      <section id="features" className="relative py-16 sm:py-32 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 scroll-fade-in">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs sm:text-sm font-medium text-zinc-600 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2"></span>
              模块一
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900">
              智能备课引擎
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              上传教材，AI 自动完成从章节识别到教学规划的全流程
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {preparationFeatures.map((feature, index) => (
              <div 
                key={feature.name}
                className="scroll-fade-in bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-200/50 group"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-zinc-900 transition-colors duration-300">
                  <feature.icon className="w-6 h-6 text-zinc-700 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-zinc-900">{feature.name}</h3>
                <p className="text-zinc-500 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能模块二：AI 老师讲解 */}
      <section className="relative py-16 sm:py-32 px-4 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 scroll-fade-in">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 bg-white text-xs sm:text-sm font-medium text-zinc-600 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2"></span>
              模块二
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900">
              AI 老师讲解
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              像真正的老师一样讲课，PPT 与语音完美同步
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teachingFeatures.map((feature, index) => (
              <div 
                key={feature.name}
                className="scroll-fade-in bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-200/50 group"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-zinc-900 transition-colors duration-300">
                  <feature.icon className="w-6 h-6 text-zinc-700 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-zinc-900">{feature.name}</h3>
                <p className="text-zinc-500 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能模块三：AI 辅助编辑 */}
      <section className="relative py-16 sm:py-32 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 scroll-fade-in">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs sm:text-sm font-medium text-zinc-600 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2"></span>
              模块三
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900">
              AI 辅助编辑
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              随时呼唤 AI 助手，润色、扩写、问答，信手拈来
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {editingFeatures.map((feature, index) => (
              <div 
                key={feature.name}
                className="scroll-fade-in bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-200/50 group"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-zinc-900 transition-colors duration-300">
                  <feature.icon className="w-6 h-6 text-zinc-700 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-zinc-900">{feature.name}</h3>
                <p className="text-zinc-500 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能模块四：课件生成与导出 */}
      <section className="relative py-16 sm:py-32 px-4 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 scroll-fade-in">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 bg-white text-xs sm:text-sm font-medium text-zinc-600 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-zinc-900 mr-2"></span>
              模块四
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-zinc-900">
              课件生成与导出
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              精美 PPT 一键生成，支持多种格式导出
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {exportFeatures.map((feature, index) => (
              <div 
                key={feature.name}
                className="scroll-fade-in bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-200/50 group"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-zinc-900 transition-colors duration-300">
                  <feature.icon className="w-6 h-6 text-zinc-700 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-zinc-900">{feature.name}</h3>
                <p className="text-zinc-500 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 完整工作流程 */}
      <section className="relative py-16 sm:py-32 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16 scroll-fade-in">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4 text-zinc-900">
              完整工作流程
            </h2>
            <p className="text-zinc-500 text-base sm:text-lg">
              从教材到课堂，AI 全程陪伴
            </p>
          </div>

          <div className="scroll-fade-in bg-white border border-zinc-200 rounded-2xl p-6 sm:p-12 shadow-2xl shadow-zinc-200/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
              {workflowSteps.map((item, index) => (
                <div key={item.step} className="text-center group">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto bg-zinc-100 rounded-full flex items-center justify-center font-bold text-lg sm:text-xl text-zinc-900 border border-zinc-200 group-hover:bg-zinc-900 group-hover:text-white group-hover:border-zinc-900 transition-colors mb-3">
                    {item.step}
                  </div>
                  <h4 className="font-semibold text-sm sm:text-base mb-1 text-zinc-900">{item.title}</h4>
                  <p className="text-zinc-500 text-xs sm:text-sm">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* 流程连接线（桌面端） */}
            <div className="hidden lg:flex items-center justify-center mt-8 pt-8 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                <span>教材</span>
                <ArrowRight className="w-4 h-4" />
                <span>扫描</span>
                <ArrowRight className="w-4 h-4" />
                <span>规划</span>
                <ArrowRight className="w-4 h-4" />
                <span>手稿</span>
                <ArrowRight className="w-4 h-4" />
                <span className="text-zinc-900 font-semibold">AI 授课</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 技术亮点 */}
      <section className="relative py-16 sm:py-24 px-4 bg-zinc-900 text-white">
        <div className="max-w-4xl mx-auto">
          <div className="scroll-fade-in text-center mb-12">
            <h3 className="text-xl sm:text-2xl font-bold mb-4">技术亮点</h3>
            <p className="text-zinc-400">基于先进的 AI 技术栈</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {techHighlights.map((tech, i) => (
              <div key={tech.name} className="scroll-fade-in text-center p-6 rounded-xl border border-zinc-800 bg-zinc-800/50 hover:bg-zinc-800 transition-colors" style={{ transitionDelay: `${i * 100}ms` }}>
                <tech.icon className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
                <h4 className="font-semibold mb-1">{tech.name}</h4>
                <p className="text-sm text-zinc-500">{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 支持的文档格式 */}
      <section className="relative py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="scroll-fade-in bg-white border border-zinc-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm">
            <h3 className="text-xl sm:text-2xl font-bold mb-6 text-zinc-900">支持多种教材格式</h3>
            <div className="flex flex-wrap justify-center gap-4">
              {['PDF', 'DOCX', 'TXT', 'MD'].map((format) => (
                <div 
                  key={format}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-lg font-mono text-base sm:text-lg text-zinc-600 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all cursor-default"
                >
                  .{format.toLowerCase()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="relative py-16 sm:py-24 px-4 border-t border-zinc-100 bg-zinc-50/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-bold mb-6 scroll-fade-in text-zinc-900">
            准备好开始智能备课了吗？
          </h2>
          <p className="text-zinc-500 text-base sm:text-lg mb-8 scroll-fade-in">
            让 AI 成为您的教学助理，释放更多创意与精力
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center scroll-fade-in w-full sm:w-auto px-4 sm:px-0">
            <Link 
              href="/login"
              className="group px-8 py-4 bg-zinc-900 text-white rounded-lg text-lg font-medium hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-zinc-500/20 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              立即体验
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="mt-16 pt-8 border-t border-zinc-200">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-zinc-400 text-sm">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                <span>智研课堂</span>
              </div>
              <span className="hidden sm:inline">•</span>
              <span>AI 教研助手 © 2025</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

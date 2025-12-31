/**
 * Remotion 配置文件
 * 
 * 性能优化配置：
 * - 多线程并发渲染（根据 CPU 核心数自动配置）
 * - JPEG 格式（比 PNG 更快）
 * - H.264 编码（兼容性最好）
 * - 🔒 安全：不暴露敏感环境变量
 */

import { Config } from '@remotion/cli/config';
import os from 'os';

// 获取 CPU 核心数，设置并发渲染线程
// 使用 CPU 核心数的 75% 以保留系统资源
const cpuCores = os.cpus().length;
const concurrency = Math.max(4, Math.floor(cpuCores * 0.75));

console.log(`🚀 Remotion: ${concurrency} 并发线程 (CPU: ${cpuCores} 核)`);

// ⚡ 核心优化：多线程并发渲染
Config.setConcurrency(concurrency);

// 使用 JPEG 格式（比 PNG 快 3-5 倍）
Config.setVideoImageFormat('jpeg');

// 允许覆盖输出文件
Config.setOverwriteOutput(true);

// 使用 H.264 编码
Config.setCodec('h264');

// 🔒 安全：通过 scripts/remotion-safe.sh 启动，已过滤敏感环境变量


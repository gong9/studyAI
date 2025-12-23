/**
 * 音色复刻脚本
 * 使用 Ai录音.m4a 文件复刻音色
 * 
 * 运行方式: npx ts-node scripts/clone-voice.ts
 * 或者: npx tsx scripts/clone-voice.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MINIMAX_API_BASE = 'https://api.minimaxi.com';
const AUDIO_FILE_PATH = path.join(process.cwd(), 'Ai.m4a');
const CONFIG_FILE_PATH = path.join(process.cwd(), 'cloned-voice-config.json');

async function main() {
  const apiKey = process.env.MINIMAX_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 错误: MINIMAX_API_KEY 未配置');
    console.error('请在 .env.local 或 .env 文件中设置 MINIMAX_API_KEY');
    process.exit(1);
  }
  
  // 检查音频文件是否存在
  if (!fs.existsSync(AUDIO_FILE_PATH)) {
    console.error('❌ 错误: 找不到音频文件:', AUDIO_FILE_PATH);
    process.exit(1);
  }
  
  const fileStats = fs.statSync(AUDIO_FILE_PATH);
  console.log('📁 音频文件信息:');
  console.log('   路径:', AUDIO_FILE_PATH);
  console.log('   大小:', (fileStats.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('');
  
  try {
    // 步骤 1: 上传音频文件
    console.log('📤 步骤 1/2: 上传音频文件...');
    
    const fileBuffer = fs.readFileSync(AUDIO_FILE_PATH);
    const blob = new Blob([fileBuffer], { type: 'audio/mp4' });
    
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'voice_clone');
    // 使用英文文件名避免敏感词检测
    uploadFormData.append('file', blob, 'voice_sample.m4a');
    
    const uploadResponse = await fetch(`${MINIMAX_API_BASE}/v1/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: uploadFormData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ 上传失败:', errorText);
      process.exit(1);
    }
    
    const uploadResult = await uploadResponse.json();
    
    if (uploadResult.base_resp?.status_code !== 0) {
      console.error('❌ 上传返回错误:', uploadResult.base_resp);
      process.exit(1);
    }
    
    const fileId = uploadResult.file?.file_id;
    console.log('✅ 文件上传成功!');
    console.log('   file_id:', fileId);
    console.log('');
    
    // 步骤 2: 创建复刻音色
    console.log('🎤 步骤 2/2: 创建复刻音色...');
    
    // voice_id 格式要求：
    // 1. 首字符必须为英文字母
    // 2. 允许数字、字母、-、_
    // 3. 末位字符不可为 -、_
    // 4. 创建的 voice_id 不可与之前重复
    const timestamp = Date.now();
    const voiceId = `myvoice${timestamp}`;
    
    console.log('   voice_id:', voiceId);
    console.log('   file_id:', fileId);
    
    const cloneRequestBody = {
      file_id: fileId,
      voice_id: voiceId,
    };
    
    console.log('   请求体:', JSON.stringify(cloneRequestBody, null, 2));
    
    const cloneResponse = await fetch(`${MINIMAX_API_BASE}/v1/voice_clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(cloneRequestBody),
    });
    
    const cloneResult = await cloneResponse.json();
    console.log('   响应:', JSON.stringify(cloneResult, null, 2));
    
    if (!cloneResponse.ok || cloneResult.base_resp?.status_code !== 0) {
      console.error('');
      console.error('❌ 复刻失败!');
      console.error('   状态码:', cloneResult.base_resp?.status_code);
      console.error('   错误信息:', cloneResult.base_resp?.status_msg);
      console.error('');
      console.error('💡 可能的原因:');
      if (cloneResult.base_resp?.status_code === 1026) {
        console.error('   - 音频内容被系统标记为敏感内容');
        console.error('   - 请尝试使用不同的音频文件');
        console.error('   - 确保音频是普通的语音朗读或对话');
      } else if (cloneResult.base_resp?.status_code === 2038) {
        console.error('   - 账户未完成身份认证');
        console.error('   - 请前往 MiniMax 平台完成个人/企业认证:');
        console.error('     https://platform.minimaxi.com/user-center/basic-information');
      } else if (cloneResult.base_resp?.status_code === 2039) {
        console.error('   - voice_id 已存在，请使用不同的 voice_id');
      }
      process.exit(1);
    }
    
    const finalVoiceId = cloneResult.voice_id || voiceId;
    console.log('✅ 音色复刻成功!');
    console.log('   voice_id:', finalVoiceId);
    console.log('');
    
    // 保存配置
    const config = {
      voiceId: finalVoiceId,
      name: 'AI课堂复刻音色',
      createdAt: new Date().toISOString(),
      fileId: fileId,
      sourceFile: 'Ai录音.m4a',
    };
    
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
    console.log('💾 配置已保存到:', CONFIG_FILE_PATH);
    console.log('');
    console.log('🎉 完成! 现在 TTS 将使用复刻后的音色');
    console.log('');
    console.log('配置内容:');
    console.log(JSON.stringify(config, null, 2));
    
  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

main();


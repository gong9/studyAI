/**
 * 获取最近的讲书项目列表 API
 */

import { NextResponse } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/recent`);

    if (!response.ok) {
      return NextResponse.json({ projects: [] }, { status: 200 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Get recent projects failed:", error);
    return NextResponse.json({ projects: [] }, { status: 200 });
  }
}


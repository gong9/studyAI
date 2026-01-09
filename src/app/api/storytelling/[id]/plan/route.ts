/**
 * 获取分集规划 API
 */

import { NextRequest, NextResponse } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const response = await fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/plan/${id}`);

    if (!response.ok) {
      return NextResponse.json({ episodes: [] }, { status: 200 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Get plan failed:", error);
    return NextResponse.json({ episodes: [] }, { status: 200 });
  }
}


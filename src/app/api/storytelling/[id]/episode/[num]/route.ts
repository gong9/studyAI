/**
 * 获取单回详情 API
 *
 * GET /api/storytelling/[id]/episode/[num]
 */

import { NextRequest, NextResponse } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string; num: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id, num } = await params;

    const response = await fetch(
      `${PYTHON_AGENT_URL}/api/v1/storytelling/episode/${id}/${num}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to get episode", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get episode failed:", error);
    return NextResponse.json(
      { error: "Failed to get episode", details: String(error) },
      { status: 500 }
    );
  }
}


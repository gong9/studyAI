/**
 * 获取讲书项目状态 API
 *
 * GET /api/storytelling/[id]/status
 */

import { NextRequest, NextResponse } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const response = await fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/status/${id}`);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to get status", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get status failed:", error);
    return NextResponse.json(
      { error: "Failed to get status", details: String(error) },
      { status: 500 }
    );
  }
}


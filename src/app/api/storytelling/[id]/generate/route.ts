/**
 * 生成单回讲稿 API
 *
 * POST /api/storytelling/[id]/generate
 * Body: { episodeNumber: number }
 */

import { NextRequest, NextResponse } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string }>;
}

interface GenerateRequest {
  episodeNumber: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body: GenerateRequest = await request.json();

    if (!body.episodeNumber || body.episodeNumber < 1) {
      return NextResponse.json(
        { error: "Invalid episode number" },
        { status: 400 }
      );
    }

    const response = await fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: id,
        episode_number: body.episodeNumber,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to generate episode", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Generate episode failed:", error);
    return NextResponse.json(
      { error: "Failed to generate episode", details: String(error) },
      { status: 500 }
    );
  }
}


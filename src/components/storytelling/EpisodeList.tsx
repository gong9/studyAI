'use client';

import React from 'react';
import { 
  Play, Pause, Clock, CheckCircle2, Loader2, Sparkles 
} from 'lucide-react';

export interface Episode {
  episode_number: number;
  title: string;
  summary: string;
  status: 'pending' | 'ready' | 'generating';
  duration_minutes: number;
}

interface EpisodeListProps {
  episodes: Episode[];
  selectedEpisode: number | null;
  onSelect: (episodeNumber: number) => void;
  onGenerate: (episodeNumber: number) => void;
  onPlay: (episodeNumber: number) => void;
  isPlaying: boolean;
  generating: boolean;
  className?: string;
}

export function EpisodeList({
  episodes,
  selectedEpisode,
  onSelect,
  onGenerate,
  onPlay,
  isPlaying,
  generating,
  className = '',
}: EpisodeListProps) {
  const getStatusIcon = (ep: Episode) => {
    if (generating && selectedEpisode === ep.episode_number) {
      return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    }
    switch (ep.status) {
      case 'ready':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-300" />;
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {episodes.map((ep) => (
        <div
          key={ep.episode_number}
          onClick={() => onSelect(ep.episode_number)}
          className={`group p-4 rounded-xl border transition-all cursor-pointer ${
            selectedEpisode === ep.episode_number
              ? 'bg-amber-50 border-amber-300 shadow-sm'
              : 'bg-white/70 border-amber-100/50 hover:border-amber-200 hover:shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getStatusIcon(ep)}
                <span className="text-xs font-bold text-zinc-400">
                  第{ep.episode_number}回
                </span>
                {ep.duration_minutes > 0 && (
                  <span className="text-xs text-zinc-300">
                    · {ep.duration_minutes}分钟
                  </span>
                )}
              </div>
              <h3 className="font-bold text-zinc-900 truncate text-sm">
                {ep.title || `第${ep.episode_number}回`}
              </h3>
              {ep.summary && (
                <p className="text-xs text-zinc-400 line-clamp-1 mt-1">{ep.summary}</p>
              )}
            </div>
            
            {ep.status === 'ready' ? (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(ep.episode_number);
                }}
                className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors"
              >
                {isPlaying && selectedEpisode === ep.episode_number ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate(ep.episode_number);
                }}
                disabled={generating}
                className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-400 flex items-center justify-center hover:bg-amber-100 hover:text-amber-600 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default EpisodeList;


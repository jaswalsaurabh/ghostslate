import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';

const DEFAULT_DURATION_SECONDS = 35;

export interface UseVideoPlayerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  seek: (time: number) => void;
  togglePlay: () => void;
  reset: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
  handlePlay: () => void;
  handlePause: () => void;
}

export function useVideoPlayer(fallbackDuration = DEFAULT_DURATION_SECONDS): UseVideoPlayerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [isPlaying, setIsPlaying] = useState(false);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const maximum = Number.isFinite(video.duration) ? video.duration : Math.max(0, time);
    const nextTime = Math.min(Math.max(0, time), maximum);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, []);

  const reset = useCallback(() => {
    const video = videoRef.current;
    video?.pause();
    if (video) video.currentTime = 0;
    setCurrentTime(0);
    setDuration(fallbackDuration);
    setIsPlaying(false);
  }, [fallbackDuration]);

  const handleLoadedMetadata = useCallback(() => {
    const videoDuration = videoRef.current?.duration;
    setDuration(videoDuration && Number.isFinite(videoDuration) ? videoDuration : fallbackDuration);
  }, [fallbackDuration]);

  const handleTimeUpdate = useCallback(() => {
    setCurrentTime(videoRef.current?.currentTime ?? 0);
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  return {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    seek,
    togglePlay,
    reset,
    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlay,
    handlePause,
  };
}

import { useRef, useEffect, useCallback } from 'react';

export function useAudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const startVisualizer = useCallback((audioElement?: HTMLAudioElement) => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (Browser Autoplay Policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create analyser if it doesn't exist
      if (!analyserRef.current) {
        analyserRef.current = audioContext.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(audioContext.destination);
      }

      const analyser = analyserRef.current;

      // Connection logic only if audioElement is provided
      if (audioElement) {
        if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch (e) {}
          sourceRef.current = null;
        }

        try {
          sourceRef.current = audioContext.createMediaElementSource(audioElement);
          sourceRef.current.connect(analyser);
        } catch (e) {
          console.warn('Failed to connect media element source (likely already connected):', e);
        }
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Stop any existing animation frame before starting a new one
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const draw = () => {
        if (!canvasRef.current) {
          animationRef.current = requestAnimationFrame(draw);
          return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        animationRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        // Check if we have real data (non-zero)
        const hasData = dataArray.some(v => v > 0);
        
        // If no data or no element, simulate some movement
        if (!hasData) {
          const time = Date.now() / 1000;
          for (let i = 0; i < bufferLength; i++) {
            dataArray[i] = Math.max(0, Math.sin(time * 2 + i * 0.1) * 50 + 50 + Math.random() * 20);
          }
        }

        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height;

          const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, '#8b5cf6'); // violet
          gradient.addColorStop(0.5, '#ec4899'); // pink
          gradient.addColorStop(1, '#f59e0b'); // amber

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, barWidth, barHeight, [4, 4, 0, 0]);
          ctx.fill();

          x += barWidth + 1;
        }
      };

      draw();
    } catch (error) {
      console.error('Error starting visualizer:', error);
    }
  }, []);

  const stopVisualizer = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    // Disconnect source when stopping to free up memory
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {}
      sourceRef.current = null;
    }

    // Clear canvas when stopped
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, []);

  const setCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  useEffect(() => {
    return () => {
      stopVisualizer();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
    };
  }, [stopVisualizer]);

  return {
    startVisualizer,
    stopVisualizer,
    setCanvasRef,
    canvasRef,
  };
}

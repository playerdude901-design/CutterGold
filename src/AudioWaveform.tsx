import { useEffect, useRef } from 'react';

export function AudioWaveform({ peaks, duration }: { peaks: ArrayLike<number>; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const block = canvas?.parentElement;
    const viewport = block?.closest<HTMLElement>('.timeline-scroll-area');
    if (!canvas || !block || !viewport) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const box = block.getBoundingClientRect();
      const visible = viewport.getBoundingClientRect();
      const left = Math.max(0, visible.left - box.left);
      const width = Math.max(0, Math.min(box.width - left, visible.right - Math.max(box.left, visible.left)));
      const height = block.clientHeight - 3;
      if (!width || height <= 0 || duration <= 0) return;
      // Only allocate a viewport-sized canvas, even for hours of audio at high zoom.
      canvas.style.left = left + 'px';
      canvas.style.width = width + 'px';
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(width * pixelRatio);
      canvas.height = Math.ceil(height * pixelRatio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(pixelRatio, pixelRatio);
      const center = height / 2;
      context.fillStyle = '#a8e89c';
      // Each peak represents 100 ms of source time, including during processing.
      // Do not stretch a partially generated envelope to the full clip duration.
      const binsPerPixel = duration * 10 / box.width;
      for (let x = 0; x < Math.ceil(width); x++) {
        const first = Math.floor((left + x) * binsPerPixel);
        if (first >= peaks.length) break;
        const end = Math.min(peaks.length, Math.max(first + 1, Math.ceil((left + x + 1) * binsPerPixel)));
        let level = 0;
        for (let index = first; index < end; index++) level = Math.max(level, peaks[index]);
        const halfHeight = Math.max(0.5, Math.min(1, level) * (center - 2));
        context.fillRect(x, center - halfHeight, 1, halfHeight * 2);
      }
    };
    const scheduleDraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(block);
    observer.observe(viewport);
    viewport.addEventListener('scroll', scheduleDraw, { passive: true });
    draw();
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', scheduleDraw);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [peaks, duration]);
  return <canvas ref={canvasRef} className="audio-waveform" aria-hidden="true" />;
}

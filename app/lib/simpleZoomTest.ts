interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  x: number;
  y: number;
}

export const createSimpleZoomTest = async (
  videoBlob: Blob,
  zoomEffects: ZoomEffect[]
): Promise<Blob> => {
  console.log('=== ENHANCED ZOOM PROCESSING ===');
  console.log('Input video size:', videoBlob.size);
  console.log('Zoom effects:', zoomEffects);
  
  if (zoomEffects.length === 0) {
    console.log('No zoom effects, returning original video');
    return videoBlob;
  }
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Use higher resolution for better quality
    canvas.width = 1920;
    canvas.height = 1080;
    
    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(canvas.captureStream(60), {
      mimeType: 'video/webm;codecs=vp9'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const finalBlob = new Blob(chunks, { type: 'video/webm' });
      console.log('Enhanced zoom processing completed. Output size:', finalBlob.size);
      resolve(finalBlob);
    };
    
    video.onloadedmetadata = () => {
      console.log('Video loaded, starting enhanced processing...');
      video.currentTime = 0;
      mediaRecorder.start();
    };
    
    video.ontimeupdate = () => {
      const currentTime = video.currentTime;
      
      // Find active zoom effect with smooth transition
      const activeEffect = zoomEffects.find(
        effect => currentTime >= effect.startTime && currentTime <= effect.endTime
      );
      
      // Calculate smooth transition
      let transitionProgress = 0;
      if (activeEffect) {
        const effectDuration = activeEffect.endTime - activeEffect.startTime;
        const timeInEffect = currentTime - activeEffect.startTime;
        
        // Smooth transition in/out over 0.5 seconds
        const transitionDuration = Math.min(0.5, effectDuration / 4);
        
        if (timeInEffect < transitionDuration) {
          // Fade in
          transitionProgress = timeInEffect / transitionDuration;
        } else if (timeInEffect > effectDuration - transitionDuration) {
          // Fade out
          transitionProgress = (effectDuration - timeInEffect) / transitionDuration;
        } else {
          // Full effect
          transitionProgress = 1;
        }
      }
      
      // Clear canvas with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (activeEffect && transitionProgress > 0) {
        // Enhanced zoom effect with smooth transitions
        const baseZoomLevel = Math.max(1.5, activeEffect.zoomLevel);
        const smoothZoomLevel = 1 + (baseZoomLevel - 1) * transitionProgress;
        
        const centerX = activeEffect.x * canvas.width;
        const centerY = activeEffect.y * canvas.height;
        
        // Calculate zoom parameters with better precision
        const scaledWidth = canvas.width / smoothZoomLevel;
        const scaledHeight = canvas.height / smoothZoomLevel;
        const sourceX = Math.max(0, Math.min(canvas.width - scaledWidth, centerX - scaledWidth / 2));
        const sourceY = Math.max(0, Math.min(canvas.height - scaledHeight, centerY - scaledHeight / 2));
        
        // Apply high-quality zoom with anti-aliasing
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.clip();
        
        // Draw zoomed video with enhanced quality
        ctx.drawImage(
          video,
          sourceX, sourceY, scaledWidth, scaledHeight,
          0, 0, canvas.width, canvas.height
        );
        
        ctx.restore();
        
        console.log(`Enhanced zoom applied: ${smoothZoomLevel.toFixed(2)}x at (${centerX.toFixed(0)}, ${centerY.toFixed(0)}) - Progress: ${(transitionProgress * 100).toFixed(1)}%`);
      } else {
        // Draw normal video without any overlays
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    };
    
    video.onended = () => {
      console.log('Video ended, stopping enhanced processing');
      mediaRecorder.stop();
    };
    
    video.onerror = (error) => {
      console.error('Video error:', error);
      reject(error);
    };
    
    video.src = URL.createObjectURL(videoBlob);
    video.play();
  });
}; 
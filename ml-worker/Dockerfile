# Use Python 3.10 slim as base image
FROM python:3.10-slim

# Prevent python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1
# Prevent pip from caching
ENV PIP_NO_CACHE_DIR=1

# Install system dependencies required for OpenCV, ffmpeg, and git
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone TalkNet-ASD repository for the S3FD face detector
RUN git clone https://github.com/TaoRuijie/TalkNet-ASD.git /app/TalkNet-ASD

# Download the S3FD pretrained face detector weights (not included in the git repo)
RUN pip install gdown && \
    gdown 1KafnHz7ccT-3IyddBsL5yi2xGtxAKypt -O /app/TalkNet-ASD/model/faceDetector/s3fd/sfd_face.pth

# Copy requirements and install them
# We install PyTorch first with the CPU index to keep the container lightweight for local demos
COPY requirements.txt /app/requirements.txt
RUN pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cpu
RUN pip install -r requirements.txt

# Fix numpy 2.0 incompatibility in TalkNet-ASD's S3FD code (np.int removed)
RUN sed -i 's/np\.int)/int)/g' /app/TalkNet-ASD/model/faceDetector/s3fd/box_utils.py && \
    sed -i 's/np\.float)/float)/g' /app/TalkNet-ASD/model/faceDetector/s3fd/box_utils.py

# Copy our custom preprocessing script into the TalkNet-ASD folder
COPY preprocess_faces.py /app/TalkNet-ASD/preprocess_faces.py

# Copy the Gradio app
COPY app.py /app/app.py

# Expose Gradio's default port
EXPOSE 8080
ENV GRADIO_SERVER_PORT=8080
ENV GRADIO_SERVER_NAME="0.0.0.0"

# Run the Gradio app
CMD ["python", "app.py"]

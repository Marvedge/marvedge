FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------
# System dependencies
# ---------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    ffmpeg \
    git \
    wget \
    unzip \
    cmake \
    pkg-config \
    python3 \
    python3-dev \
    python3-pip \
    python3.9 \
    python3.9-dev \
    default-jdk \
    libavformat-dev \
    libavcodec-dev \
    libavutil-dev \
    libswscale-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libgtk2.0-dev \
    libtbb-dev \
    libdc1394-22-dev \
    software-properties-common \
    gnupg \
    dirmngr \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------
# Python
# ---------------------------------------------------------
ENV HERMETIC_PYTHON_VERSION=3.9

# ---------------------------------------------------------
# Install Bazelisk
# ---------------------------------------------------------
RUN wget -O /usr/local/bin/bazel \
    https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64 \
    && chmod +x /usr/local/bin/bazel

# ---------------------------------------------------------
# Clone MediaPipe
# ---------------------------------------------------------
WORKDIR /

RUN git clone \
    --branch v0.10.21 \
    --depth 1 \
    https://github.com/google/mediapipe.git

WORKDIR /mediapipe

# ---------------------------------------------------------
# Build OpenCV 3.4 from source
# ---------------------------------------------------------
RUN git clone --branch 3.4 --depth 1 \
    https://github.com/opencv/opencv.git /tmp/opencv \
    && git clone --branch 3.4 --depth 1 \
    https://github.com/opencv/opencv_contrib.git /tmp/opencv_contrib \
    && mkdir -p /tmp/opencv/build \
    && cd /tmp/opencv/build \
    && cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DBUILD_TESTS=OFF \
        -DBUILD_PERF_TESTS=OFF \
        -DBUILD_opencv_ts=OFF \
        -DBUILD_opencv_dnn=OFF \
        -DBUILD_opencv_dnn_objdetect=OFF \
        -DBUILD_opencv_face=OFF \
        -DBUILD_opencv_js=OFF \
        -DBUILD_opencv_aruco=OFF \
        -DBUILD_opencv_bgsegm=OFF \
        -DBUILD_opencv_bioinspired=OFF \
        -DBUILD_opencv_ccalib=OFF \
        -DBUILD_opencv_datasets=OFF \
        -DBUILD_opencv_dpm=OFF \
        -DBUILD_opencv_fuzzy=OFF \
        -DBUILD_opencv_hfs=OFF \
        -DBUILD_opencv_img_hash=OFF \
        -DBUILD_opencv_line_descriptor=OFF \
        -DBUILD_opencv_phase_unwrapping=OFF \
        -DBUILD_opencv_plot=OFF \
        -DBUILD_opencv_quality=OFF \
        -DBUILD_opencv_reg=OFF \
        -DBUILD_opencv_rgbd=OFF \
        -DBUILD_opencv_saliency=OFF \
        -DBUILD_opencv_shape=OFF \
        -DBUILD_opencv_structured_light=OFF \
        -DBUILD_opencv_surface_matching=OFF \
        -DBUILD_opencv_world=OFF \
        -DBUILD_opencv_xobjdetect=OFF \
        -DBUILD_opencv_xphoto=OFF \
        -DOPENCV_EXTRA_MODULES_PATH=/tmp/opencv_contrib/modules \
        -DWITH_EIGEN=ON \
        -DWITH_PTHREADS=ON \
        -DWITH_PTHREADS_PF=ON \
        -DWITH_JPEG=ON \
        -DWITH_PNG=ON \
        -DWITH_TIFF=ON \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig \
    && rm -rf /tmp/opencv /tmp/opencv_contrib

# ---------------------------------------------------------
# Verify OpenCV 3
# ---------------------------------------------------------
RUN pkg-config --modversion opencv4 || true \
    && find /usr/local/include/opencv2 -name version.hpp -exec grep -E \
       'CV_VERSION_(MAJOR|MINOR|REVISION)' {} \;

# ---------------------------------------------------------
# Configure MediaPipe to use OpenCV 3 from /usr/local
# ---------------------------------------------------------
RUN python3 - <<'PY'
from pathlib import Path

workspace = Path("WORKSPACE")
text = workspace.read_text()

text = text.replace(
    'path = "/usr",',
    'path = "/usr/local",',
    1
)

workspace.write_text(text)
PY

RUN cat > third_party/opencv_linux.BUILD <<'EOF'
licenses(["notice"])

exports_files(["LICENSE"])

cc_library(
    name = "opencv",
    linkopts = [
        "-L/usr/local/lib",
        "-l:libopencv_core.so",
        "-l:libopencv_calib3d.so",
        "-l:libopencv_features2d.so",
        "-l:libopencv_highgui.so",
        "-l:libopencv_imgcodecs.so",
        "-l:libopencv_imgproc.so",
        "-l:libopencv_video.so",
        "-l:libopencv_videoio.so",
    ],
    visibility = ["//visibility:public"],
)
EOF

# ---------------------------------------------------------
# Install LLVM / Clang 15
# ---------------------------------------------------------
RUN wget https://apt.llvm.org/llvm.sh -O /tmp/llvm.sh \
    && chmod +x /tmp/llvm.sh \
    && /tmp/llvm.sh 15 \
    && rm /tmp/llvm.sh

ENV CC=clang-15
ENV CXX=clang++-15

# ---------------------------------------------------------
# Copy headless AutoFlip graph and JSON runner
# ---------------------------------------------------------
COPY autoflip/run_autoflip_to_json.cc /mediapipe/mediapipe/examples/desktop/autoflip/
COPY autoflip/autoflip_headless_graph.pbtxt /mediapipe/mediapipe/examples/desktop/autoflip/

RUN cat >> mediapipe/examples/desktop/autoflip/BUILD <<'EOF'

cc_binary(
    name = "run_autoflip_to_json",
    srcs = ["run_autoflip_to_json.cc"],
    data = [
        "//mediapipe/modules/face_detection:face_detection_full_range_sparse.tflite",
    ],
    deps = [
        ":autoflip_messages_cc_proto",
        "//mediapipe/calculators/core:packet_thinner_calculator",
        "//mediapipe/calculators/image:scale_image_calculator",
        "//mediapipe/calculators/video:opencv_video_decoder_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:border_detection_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:face_to_region_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:localization_to_region_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:scene_cropping_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:shot_boundary_calculator",
        "//mediapipe/examples/desktop/autoflip/calculators:signal_fusing_calculator",
        "//mediapipe/examples/desktop/autoflip/subgraph:autoflip_face_detection_subgraph",
        "//mediapipe/examples/desktop/autoflip/subgraph:autoflip_object_detection_subgraph",
        "//mediapipe/framework:calculator_framework",
        "//mediapipe/framework/formats:video_stream_header",
        "//mediapipe/framework/port:file_helpers",
        "//mediapipe/framework/port:parse_text_proto",
        "//mediapipe/framework/port:ret_check",
        "//mediapipe/framework/port:status",
        "//mediapipe/framework/port:statusor",
        "@com_google_absl//absl/flags:flag",
        "@com_google_absl//absl/flags:parse",
        "@com_google_absl//absl/log:absl_log",
        "@com_google_absl//absl/strings",
    ],
)
EOF

# ---------------------------------------------------------
# Build AutoFlip (both video renderer and headless JSON runner)
# ---------------------------------------------------------
RUN bazel build -c opt \
    --define MEDIAPIPE_DISABLE_GPU=1 \
    --define=xnn_enable_avxvnniint8=false \
    --repo_env=HERMETIC_PYTHON_VERSION=3.9 \
    --experimental_repository_downloader_retries=5 \
    mediapipe/examples/desktop/autoflip:run_autoflip \
    mediapipe/examples/desktop/autoflip:run_autoflip_to_json \
    && ln -sf /mediapipe/bazel-bin/mediapipe/examples/desktop/autoflip/run_autoflip /usr/local/bin/run_autoflip \
    && ln -sf /mediapipe/bazel-bin/mediapipe/examples/desktop/autoflip/run_autoflip_to_json /usr/local/bin/run_autoflip_to_json

# ---------------------------------------------------------
# Copy object detection models and create resource symlinks
# ---------------------------------------------------------
COPY mediapipe-models/ssdlite_object_detection.tflite /mediapipe/mediapipe/models/
COPY mediapipe-models/ssdlite_object_detection_labelmap.txt /mediapipe/mediapipe/models/

RUN mkdir -p /mediapipe/bazel-bin/mediapipe/models \
    && ln -sf /mediapipe/mediapipe/models/ssdlite_object_detection.tflite /mediapipe/bazel-bin/mediapipe/models/ \
    && ln -sf /mediapipe/mediapipe/models/ssdlite_object_detection_labelmap.txt /mediapipe/bazel-bin/mediapipe/models/ \
    && ln -sf /mediapipe/mediapipe/models /mediapipe/models

# ---------------------------------------------------------
# Deploy ML HTTP inference service (Task-00023)
# ---------------------------------------------------------
WORKDIR /app
COPY autoflip/requirements.txt /app/
RUN pip3 install --no-cache-dir -r /app/requirements.txt

COPY autoflip/service.py autoflip/server.py autoflip/test_service.py /app/

EXPOSE 8000
ENTRYPOINT ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]

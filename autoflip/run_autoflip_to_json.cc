// Copyright 2026 Marvedge. All rights reserved.
// Runner for headless AutoFlip saliency analysis emitting Task-00016 crop-coordinate JSON.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/log/absl_log.h"
#include "absl/strings/str_cat.h"
#include "mediapipe/examples/desktop/autoflip/autoflip_messages.pb.h"
#include "mediapipe/framework/calculator_framework.h"
#include "mediapipe/framework/formats/video_stream_header.h"
#include "mediapipe/framework/port/file_helpers.h"
#include "mediapipe/framework/port/parse_text_proto.h"
#include "mediapipe/framework/port/ret_check.h"
#include "mediapipe/framework/port/status.h"
#include "mediapipe/framework/port/statusor.h"

ABSL_FLAG(std::string, calculator_graph_config_file,
          "mediapipe/examples/desktop/autoflip/autoflip_headless_graph.pbtxt",
          "Path to text format CalculatorGraphConfig proto.");

ABSL_FLAG(std::string, input_video_path, "",
          "Path to the input video file to analyze.");

ABSL_FLAG(std::string, output_json_path, "",
          "Path to write the resulting crop trajectory JSON. "
          "If empty, output is printed to stdout.");

ABSL_FLAG(std::string, aspect_ratio, "9:16",
          "Target aspect ratio for the crop trajectory (e.g. '9:16', '1:1', '4:5').");

namespace {

struct CropTargetRecord {
  double timestamp_sec = 0.0;
  int64_t frame = 0;
  double x = 0.0;
  double y = 0.0;
  double width = 0.0;
  double height = 0.0;
};

std::string BuildCropTargetJson(
    const mediapipe::VideoHeader& header,
    const std::string& aspect_ratio,
    const std::vector<CropTargetRecord>& targets,
    double duration_sec) {
  std::ostringstream json;
  json << std::fixed << std::setprecision(4);

  json << "{\n";
  json << "  \"schema_version\": 1,\n";
  json << "  \"source\": {\n";
  json << "    \"width\": " << header.width << ",\n";
  json << "    \"height\": " << header.height << ",\n";
  json << "    \"fps\": " << (header.frame_rate > 0 ? header.frame_rate : 30.0) << ",\n";
  json << "    \"duration_sec\": " << duration_sec << "\n";
  json << "  },\n";
  json << "  \"output\": {\n";
  json << "    \"aspect_ratio\": \"" << aspect_ratio << "\"\n";
  json << "  },\n";
  json << "  \"timeline\": {\n";
  json << "    \"timebase\": \"seconds\",\n";
  json << "    \"sampling\": \"keyframes_interpolated\"\n";
  json << "  },\n";
  json << "  \"crop_targets\": [\n";

  for (size_t i = 0; i < targets.size(); ++i) {
    const auto& t = targets[i];
    json << "    {\n";
    json << "      \"timestamp_sec\": " << t.timestamp_sec << ",\n";
    json << "      \"frame\": " << t.frame << ",\n";
    json << "      \"crop\": {\n";
    json << "        \"x\": " << t.x << ",\n";
    json << "        \"y\": " << t.y << ",\n";
    json << "        \"width\": " << t.width << ",\n";
    json << "        \"height\": " << t.height << "\n";
    json << "      },\n";
    json << "      \"source\": \"autoflip\"\n";
    json << "    }" << (i + 1 < targets.size() ? "," : "") << "\n";
  }

  json << "  ]\n";
  json << "}\n";

  return json.str();
}

}  // namespace

absl::Status RunAutoFlipToJson() {
  const std::string input_video_path = absl::GetFlag(FLAGS_input_video_path);
  RET_CHECK(!input_video_path.empty()) << "--input_video_path must be specified.";

  const std::string aspect_ratio = absl::GetFlag(FLAGS_aspect_ratio);
  RET_CHECK(!aspect_ratio.empty()) << "--aspect_ratio must be specified.";

  const std::string config_file = absl::GetFlag(FLAGS_calculator_graph_config_file);
  std::string graph_config_contents;
  MP_RETURN_IF_ERROR(mediapipe::file::GetContents(config_file, &graph_config_contents));

  mediapipe::CalculatorGraphConfig config =
      mediapipe::ParseTextProtoOrDie<mediapipe::CalculatorGraphConfig>(
          graph_config_contents);

  std::map<std::string, mediapipe::Packet> input_side_packets;
  input_side_packets["input_video_path"] =
      mediapipe::MakePacket<std::string>(input_video_path);
  input_side_packets["aspect_ratio"] =
      mediapipe::MakePacket<std::string>(aspect_ratio);

  mediapipe::CalculatorGraph graph;
  MP_RETURN_IF_ERROR(graph.Initialize(config, input_side_packets));

  mediapipe::VideoHeader video_header;
  bool has_header = false;
  MP_RETURN_IF_ERROR(graph.ObserveOutputStream(
      "video_header",
      [&video_header, &has_header](const mediapipe::Packet& packet) -> absl::Status {
        video_header = packet.Get<mediapipe::VideoHeader>();
        has_header = true;
        return absl::OkStatus();
      }));

  std::vector<mediapipe::autoflip::ExternalRenderFrame> render_frames;
  bool has_render_frames = false;
  MP_RETURN_IF_ERROR(graph.ObserveOutputStream(
      "external_render_list",
      [&render_frames, &has_render_frames](const mediapipe::Packet& packet) -> absl::Status {
        render_frames =
            packet.Get<std::vector<mediapipe::autoflip::ExternalRenderFrame>>();
        has_render_frames = true;
        return absl::OkStatus();
      }));

  ABSL_LOG(INFO) << "Starting headless AutoFlip analysis on: " << input_video_path;
  MP_RETURN_IF_ERROR(graph.StartRun({}));
  MP_RETURN_IF_ERROR(graph.WaitUntilDone());
  ABSL_LOG(INFO) << "Headless AutoFlip analysis completed.";

  RET_CHECK(has_header) << "Did not receive VideoHeader prestream from decoder.";
  RET_CHECK(has_render_frames)
      << "Did not receive external_render_list from SceneCroppingCalculator.";

  const int source_width = video_header.width;
  const int source_height = video_header.height;
  RET_CHECK_GT(source_width, 0) << "Decoded source width must be positive: " << source_width;
  RET_CHECK_GT(source_height, 0) << "Decoded source height must be positive: " << source_height;

  std::vector<CropTargetRecord> targets;
  targets.reserve(render_frames.size());

  double last_timestamp_sec = -1.0;
  int64_t frame_index = 0;

  for (const auto& render_frame : render_frames) {
    if (!render_frame.has_crop_from_location()) {
      continue;
    }

    double timestamp_sec = static_cast<double>(render_frame.timestamp_us()) / 1000000.0;
    if (timestamp_sec < 0.0) {
      timestamp_sec = 0.0;
    }

    // Task-00016 validation invariant: timestamps must be strictly monotonic.
    // Skip duplicates that share identical microsecond timestamps.
    if (!targets.empty() && timestamp_sec <= last_timestamp_sec) {
      continue;
    }

    const auto& crop_from = render_frame.crop_from_location();
    double raw_x = crop_from.x();
    double raw_y = crop_from.y();
    double raw_w = crop_from.width();
    double raw_h = crop_from.height();

    // Clamp coordinates within source video boundaries [0, source_dim]
    double clamped_x = std::max(0.0, raw_x);
    double clamped_y = std::max(0.0, raw_y);
    if (clamped_x >= static_cast<double>(source_width)) {
      clamped_x = std::max(0.0, static_cast<double>(source_width - 1));
    }
    if (clamped_y >= static_cast<double>(source_height)) {
      clamped_y = std::max(0.0, static_cast<double>(source_height - 1));
    }

    double clamped_w = std::max(1.0, raw_w);
    double clamped_h = std::max(1.0, raw_h);
    if (clamped_x + clamped_w > static_cast<double>(source_width)) {
      clamped_w = static_cast<double>(source_width) - clamped_x;
    }
    if (clamped_y + clamped_h > static_cast<double>(source_height)) {
      clamped_h = static_cast<double>(source_height) - clamped_y;
    }

    CropTargetRecord rec;
    rec.timestamp_sec = timestamp_sec;
    rec.frame = frame_index++;
    rec.x = clamped_x;
    rec.y = clamped_y;
    rec.width = clamped_w;
    rec.height = clamped_h;

    targets.push_back(rec);
    last_timestamp_sec = timestamp_sec;
  }

  // Ensure duration_sec covers the last detected timestamp
  double duration_sec = static_cast<double>(video_header.duration);
  if (duration_sec <= 0.0 || (last_timestamp_sec > duration_sec)) {
    duration_sec = (last_timestamp_sec >= 0.0) ? last_timestamp_sec : 0.0;
  }

  const std::string json_output = BuildCropTargetJson(
      video_header, aspect_ratio, targets, duration_sec);

  const std::string output_json_path = absl::GetFlag(FLAGS_output_json_path);
  if (!output_json_path.empty()) {
    std::ofstream out_file(output_json_path);
    RET_CHECK(out_file.is_open())
        << "Failed to open output JSON file for writing: " << output_json_path;
    out_file << json_output;
    out_file.close();
    ABSL_LOG(INFO) << "Wrote " << targets.size() << " crop targets to " << output_json_path;
  } else {
    std::cout << json_output << std::flush;
  }

  return absl::OkStatus();
}

int main(int argc, char** argv) {
  google::InitGoogleLogging(argv[0]);
  absl::ParseCommandLine(argc, argv);

  const absl::Status status = RunAutoFlipToJson();
  if (!status.ok()) {
    ABSL_LOG(ERROR) << "run_autoflip_to_json failed: " << status.message();
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}

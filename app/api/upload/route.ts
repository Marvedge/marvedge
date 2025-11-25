import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/app/lib/cloudinary";
import type { UploadApiOptions, UploadApiErrorResponse, UploadApiResponse } from "cloudinary";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const uploadPreset = formData.get("upload_preset") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadOptions: UploadApiOptions = {
        folder: "profile_pics",
        resource_type: "auto",
      };

      if (uploadPreset) {
        uploadOptions.upload_preset = uploadPreset;
      }

      cloudinary.uploader
        .upload_stream(
          uploadOptions,
          (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
            if (error) {
              console.error("Cloudinary Upload Error:", error);
              reject(error);
            } else {
              console.log("Cloudinary Upload Success:", result?.secure_url);
              resolve(result);
            }
          }
        )
        .end(buffer);
    });

    return NextResponse.json(uploadResult);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to upload file";
    console.error("Upload API Error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

import os
import cv2
import numpy as np
import torch

from .box_utils import nms_
from .nets import S3FDNet

img_mean = np.array([104.0, 117.0, 123.0])[:, np.newaxis, np.newaxis].astype("float32")


class S3FD:
    def __init__(self, device: str = "cpu", weights_path: str = None):
        self.device = device
        self.net = S3FDNet(device=self.device).to(self.device)
        self.weights_loaded = False

        target_path = weights_path or os.environ.get("TALKNET_S3FD_WEIGHTS")
        if not target_path:
            candidates = [
                "/app/weights/sfd_face.pth",
                "/app/weights/s3fd.pth",
                os.path.join(os.path.dirname(__file__), "sfd_face.pth"),
                os.path.join(os.path.dirname(__file__), "s3fd.pth"),
            ]
            for c in candidates:
                if os.path.isfile(c):
                    target_path = c
                    break

        if target_path and os.path.isfile(target_path):
            state_dict = torch.load(target_path, map_location=self.device)
            self.net.load_state_dict(state_dict)
            self.weights_loaded = True

        self.net.eval()

    def detect_faces(self, image: np.ndarray, conf_th: float = 0.8, scales=None):
        if scales is None:
            scales = [1]
        w, h = image.shape[1], image.shape[0]
        bboxes = np.empty(shape=(0, 5))

        with torch.no_grad():
            for s in scales:
                scaled_img = cv2.resize(image, dsize=(0, 0), fx=s, fy=s, interpolation=cv2.INTER_LINEAR)
                scaled_img = np.swapaxes(scaled_img, 1, 2)
                scaled_img = np.swapaxes(scaled_img, 1, 0)
                scaled_img = scaled_img[[2, 1, 0], :, :]
                scaled_img = scaled_img.astype("float32")
                scaled_img -= img_mean
                scaled_img = scaled_img[[2, 1, 0], :, :]
                x = torch.from_numpy(scaled_img).unsqueeze(0).to(self.device)
                y = self.net(x)

                detections = y.data
                scale = torch.Tensor([w, h, w, h])

                for i in range(detections.size(1)):
                    j = 0
                    while detections[0, i, j, 0] > conf_th:
                        score = detections[0, i, j, 0]
                        pt = (detections[0, i, j, 1:] * scale).cpu().numpy()
                        bbox = (pt[0], pt[1], pt[2], pt[3], score)
                        bboxes = np.vstack((bboxes, bbox))
                        j += 1

            keep = nms_(bboxes, 0.1)
            bboxes = bboxes[keep]

        return bboxes

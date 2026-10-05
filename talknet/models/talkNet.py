import logging
import torch
import torch.nn as nn

from .loss import lossA, lossAV, lossV
from .talkNetModel import talkNetModel

logger = logging.getLogger("talknet.model")


class talkNet(nn.Module):
    def __init__(self, device: str = "cpu", **kwargs):
        super(talkNet, self).__init__()
        self.device = device
        self.model = talkNetModel().to(device)
        self.lossAV = lossAV().to(device)
        self.lossA = lossA().to(device)
        self.lossV = lossV().to(device)

    def loadParameters(self, path: str):
        selfState = self.state_dict()
        loadedState = torch.load(path, map_location=self.device)
        for name, param in loadedState.items():
            origName = name
            if name not in selfState:
                name = name.replace("module.", "")
                if name not in selfState:
                    logger.debug("%s is not in the model.", origName)
                    continue
            if selfState[name].size() != loadedState[origName].size():
                logger.warning(
                    "Wrong parameter length: %s, model: %s, loaded: %s",
                    origName,
                    selfState[name].size(),
                    loadedState[origName].size(),
                )
                continue
            selfState[name].copy_(param)

    def saveParameters(self, path: str):
        torch.save(self.state_dict(), path)

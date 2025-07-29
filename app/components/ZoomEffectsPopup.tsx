"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/dateUtils";

interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  x: number; // center point x (0-1)
  y: number; // center point y (0-1)
}



interface ZoomEffectsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  zoomEffects: ZoomEffect[];
  onZoomEffectsChange: (effects: ZoomEffect[]) => void;
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
}

export default function ZoomEffectsPopup({
  isOpen,
  onClose,
  zoomEffects,
  onZoomEffectsChange,
  currentTime,
  duration,
  onSeek, // eslint-disable-line @typescript-eslint/no-unused-vars
}: ZoomEffectsPopupProps) {
  const [editingEffect, setEditingEffect] = useState<ZoomEffect | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [zoomLevel, setZoomLevel] = useState(2.0);
  const [centerX, setCenterX] = useState(0.5);
  const [centerY, setCenterY] = useState(0.5);




  const parseTime = (timeString: string) => {
    const parts = timeString.split(":").map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  const handleAddEffect = () => {
    const newEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: parseTime(startTime),
      endTime: parseTime(endTime),
      zoomLevel,
      x: centerX,
      y: centerY,
    };

    onZoomEffectsChange([...zoomEffects, newEffect]);
    resetForm();
  };

  const handleEditEffect = (effect: ZoomEffect) => {
    setEditingEffect(effect);
    setStartTime(formatTime(effect.startTime));
    setEndTime(formatTime(effect.endTime));
    setZoomLevel(effect.zoomLevel);
    setCenterX(effect.x);
    setCenterY(effect.y);
  };

  const handleUpdateEffect = () => {
    if (!editingEffect) return;

    const updatedEffect: ZoomEffect = {
      ...editingEffect,
      startTime: parseTime(startTime),
      endTime: parseTime(endTime),
      zoomLevel,
      x: centerX,
      y: centerY,
    };

    const updatedEffects = zoomEffects.map(effect =>
      effect.id === editingEffect.id ? updatedEffect : effect
    );

    onZoomEffectsChange(updatedEffects);
    setEditingEffect(null);
    resetForm();
  };

  const handleDeleteEffect = (id: string) => {
    onZoomEffectsChange(zoomEffects.filter(effect => effect.id !== id));
  };

  const resetForm = () => {
    setStartTime("");
    setEndTime("");
    setZoomLevel(2.0);
    setCenterX(0.5);
    setCenterY(0.5);
    setEditingEffect(null);
  };

  const handleSetCurrentTime = () => {
    if (editingEffect) {
      setEndTime(formatTime(currentTime));
    } else {
      setStartTime(formatTime(currentTime));
    }
  };

  const handleAddTestEffect = () => {
    const testEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: Math.max(0, currentTime - 5),
      endTime: Math.min(duration, currentTime + 5),
      zoomLevel: 2.0,
      x: 0.5,
      y: 0.5,
    };

    onZoomEffectsChange([...zoomEffects, testEffect]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Zoom Effects</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="0:00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="0:00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zoom Level
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-500 mt-1">{zoomLevel}x</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Center Point
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">X Position</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={centerX}
                  onChange={(e) => setCenterX(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-500">{Math.round(centerX * 100)}%</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Y Position</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={centerY}
                  onChange={(e) => setCenterY(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-500">{Math.round(centerY * 100)}%</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSetCurrentTime}
              variant="outline"
              size="sm"
            >
              Set Current Time ({formatTime(currentTime)})
            </Button>
            <Button
              onClick={handleAddTestEffect}
              variant="outline"
              size="sm"
            >
              Add Test Effect
            </Button>
          </div>

          <div className="flex gap-2">
            {editingEffect ? (
              <>
                <Button
                  onClick={handleUpdateEffect}
                  className="flex-1"
                >
                  Update Effect
                </Button>
                <Button
                  onClick={resetForm}
                  variant="outline"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                onClick={handleAddEffect}
                disabled={!startTime || !endTime}
                className="flex-1"
              >
                Add Effect
              </Button>
            )}
          </div>
        </div>

        {/* Effects List */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Current Effects</h3>
          {zoomEffects.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No zoom effects added yet.</p>
          ) : (
            <div className="space-y-2">
              {zoomEffects.map((effect) => (
                <div
                  key={effect.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {formatTime(effect.startTime)} - {formatTime(effect.endTime)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Zoom: {effect.zoomLevel}x | Center: ({Math.round(effect.x * 100)}%, {Math.round(effect.y * 100)}%)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditEffect(effect)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteEffect(effect.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 